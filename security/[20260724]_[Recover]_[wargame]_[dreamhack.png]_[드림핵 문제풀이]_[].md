[문제 링크](https://dreamhack.io/wargame/challenges/1569)

## 문제 분석

문제의 파일을 리버싱을 하면 다음과 같이 나온다.

```c
__int64 __fastcall main(int a1, char **a2, char **a3)
{
  char ptr; // [rsp+Bh] [rbp-25h] BYREF
  int v5; // [rsp+Ch] [rbp-24h]
  _BYTE *v6; // [rsp+10h] [rbp-20h]
  FILE *stream; // [rsp+18h] [rbp-18h]
  FILE *s; // [rsp+20h] [rbp-10h]
  unsigned __int64 v9; // [rsp+28h] [rbp-8h]

  v9 = __readfsqword(0x28u);
  v6 = &unk_2004;
  stream = fopen("flag.png", "rb");
  if ( !stream )
  {
    puts("fopen() error");
    exit(1);
  }
  s = fopen("encrypted", "wb");
  if ( !s )
  {
    puts("fopen() error");
    fclose(stream);
    exit(1);
  }
  v5 = 0;
  while ( fread(&ptr, 1u, 1u, stream) == 1 )
  {
    ptr ^= v6[v5 % 4];
    ptr += 19;
    fwrite(&ptr, 1u, 1u, s);
    ++v5;
  }
  fclose(stream);
  fclose(s);
  return 0;
}
```

코드를 보면 flag.png파일을 받아 암호화하여 내보내는 문제이다. 즉, 이 문제는 암호화된 파일을 복호화하는 문제이다.



## 암호화 분석

이 코드에서 암호화코드는 다음과 같다.

```c
while ( fread(&ptr, 1u, 1u, stream) == 1 )
{
  ptr ^= v6[v5 % 4];
  ptr += 19;
  fwrite(&ptr, 1u, 1u, s);
  ++v5;
}
```

이 암호화 코드는 원본 파일(`flag.png`)에서 1바이트씩 읽어와서 두 가지 연산을 수행한다.

1. **XOR 연산:** 4바이트 길이의 배열(`v6`) 값 중 하나와 XOR 연산을 수행한다.
2. **덧셈 연산:** 그 결과에 19를 더합니다.

암호문 = (평문 xor 키) + 19

## 복호화 로직 

복호화는 암호화의 역순이니 덧셈을 먼저 빼기로 되돌리고, XOR 연산을 다시 수행하면 된다.

평문 = (암호문 - 19) xor 19

단, 4바이트 길이의 키(`v6` 배열의 값)를 모른다는것이다. 하지만 원본 파일이 **PNG 이미지**라는 사실을 통해 키를 알아낼 수 있다.



모든 PNG 파일은 파일의 시작 부분이 항상 고정된 8바이트의 시그니처(Magic Header)로 시작한다.

- **PNG 헤더:** `89 50 4E 47 0D 0A 1A 0A` (Hex)

키의 길이가 4바이트이므로, 암호화된 파일의 **첫 4바이트**와 PNG 헤더의 첫 4바이트(`89 50 4E 47`)를 비교하면 역산하여 4바이트 키를 완전히 복구할 수 있다.

키 = (암호문 - 19) xor png헤더



## C언어와 파이썬의 숫자 처리 차이

**C언어 (암호화):** `ptr` 변수는 1바이트 크기(`char`)이다. 1바이트가 담을 수 있는 숫자는 `0 ~ 255`뿐이다. 만약 250이라는 값에 19를 더해서 269가 되면, 한계치인 255를 넘어가서 **오버플로우(Overflow)** 가 발생하고 값이 **13**이 된다.

**파이썬 (복호화):** 파이썬의 숫자(정수)는 크기 제한이 없다. 암호문이 13일 때 복호화를 위해 단순히 `13 - 19`를 하면 파이썬은 **-6**이라는 음수를 내뱉는다. 바이트에는 음수가 들어갈 수 없으므로 에러가 나거나 엉뚱한 값이 된다.

파이썬의 나머지 연산자(`%`)는 음수에 적용될 때 아주 유용한 특성이 있다. 음수를 256으로 나누면, 모자란 만큼 뒤에서부터 빼서 양수로 만들어준다.

**[예시: 평문(XOR 연산까지 끝난 값)이 250이었을 때]**

1. **암호화 (C언어):**
   - 250 + 19 = 269
   - 오버플로우가 발생해서 **13**으로 암호화되어 저장됨
2. **복호화 실패 ( `% 256`이 없을 때):**
   - 암호문 13 읽어옴
   - 13 - 19 = **-6** (원래 값 250과 전혀 다름)
3. **복호화 성공 (`% 256`을 적용했을 때):**
   - 암호문 13 읽어옴
   - (13 - 19) % 256 = -6 % 256 = **250** 



## 익스플로잇 코드

```python
def decrypt_file():
    # 1. 암호화된 파일 읽기
    with open('encrypted', 'rb') as f:
        enc_data = bytearray(f.read())

    # PNG 파일의 고정된 헤더 첫 4바이트
    png_header = [0x89, 0x50, 0x4E, 0x47]

    # 2. 4바이트 키 복구 (Known Plaintext Attack)
    key = []
    for i in range(4):
        # 키 = (암호문 - 19) ^ 평문
        k = ((enc_data[i] - 19) % 256) ^ png_header[i]
        key.append(k)
        
    print(f"[*] 4바이트 Key: {[hex(x) for x in key]}")

    # 3. 전체 파일 복호화
    dec_data = bytearray()
    for i in range(len(enc_data)):
        # 평문 = (암호문 - 19) ^ 키
        p = ((enc_data[i] - 19) % 256) ^ key[i % 4]
        dec_data.append(p)

    # 4. 복호화된 데이터를 flag.png로 저장
    with open('flag.png', 'wb') as f:
        f.write(dec_data)

if __name__ == '__main__':
    decrypt_file()
```

