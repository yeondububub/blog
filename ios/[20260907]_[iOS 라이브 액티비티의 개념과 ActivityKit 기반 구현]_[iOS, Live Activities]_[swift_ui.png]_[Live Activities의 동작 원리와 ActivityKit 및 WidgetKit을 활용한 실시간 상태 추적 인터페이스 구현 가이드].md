# iOS 라이브 액티비티의 개념과 ActivityKit 기반 구현

iOS 16.1에서 도입된 라이브 액티비티(Live Activities)는 앱의 최신 상태를 잠금 화면(Lock Screen)과 Dynamic Island에 실시간으로 표시하는 시스템 인터페이스입니다. 배달 진행 상황, 택시 배차, 스포츠 경기 스코어, 실시간 작업 타이머 등 시간에 따라 연속적으로 갱신되는 데이터를 단일 인터페이스 세션으로 제공합니다.

본 문서에서는 기존 알림 및 위젯 방식의 기술적 한계점을 살펴보고, `ActivityKit`과 `WidgetKit`을 결합하여 라이브 액티비티를 구현하는 아키텍처와 생명주기 제어 코드를 단계별로 분석합니다.

---

## 1. 기술적 배경 및 문제 제기 (기존 방식의 한계점)

전통적인 iOS 애플리케이션에서 백그라운드에 위치한 앱이 사용자에게 지속적인 상태 변화를 전달하기 위해 사용한 수단은 크게 두 가지였습니다.

### 1.1 원격 및 로컬 푸시 알림의 한계
- **알림 센터 누적 피로도**: 상태가 단계별로 변경될 때마다(예: 주문 접수 -> 조리 중 -> 배달 시작 -> 도착) 매번 새로운 푸시 알림을 발송하면 알림 센터에 메시지가 계속 누적되어 사용자의 주의를 분산시킵니다.
- **상태의 즉각성 부족**: 알림 배너는 몇 초 후 자동으로 사라지므로, 사용자가 현재 진행 상황을 다시 확인하려면 화면을 스와이프하여 알림 센터를 열거나 앱을 직접 실행해야 합니다.
- **알림 갱신 레이턴시**: `apns-collapse-id` 헤더를 사용하여 기존 알림을 덮어쓰더라도, 시각적인 전환 애니메이션이 매끄럽지 않으며 화면이 켜진 상태에서 지속적인 모니터링을 지원하지 못합니다.

### 1.2 일반 위젯(WidgetKit)의 한계
- **타임라인 기반 업데이트 제약**: 일반 위젯은 `TimelineProvider`를 기반으로 동작하며, 시스템이 배터리와 성능을 고려하여 갱신 주기를 결정합니다. 초 단위 혹은 예측 불가능한 시점의 실시간 데이터 갱신을 즉각적으로 반영할 수 없습니다.
- **실시간 상호작용성 부재**: 일반 위젯은 홈 화면과 잠금 화면에 고정된 뷰일 뿐, 특정 이벤트의 시작과 종료에 맞추어 생명주기를 능동적으로 생성하고 소멸시키는 세션 개념을 지원하지 않습니다.

이러한 문제를 해결하기 위해, 특정 이벤트 세션의 시작부터 종료까지 지속되는 단일 UI 컨테이너로서 실시간 데이터를 수신 및 렌더링하는 전용 프레임워크인 `ActivityKit`이 도입되었습니다.

---

## 2. 핵심 개념 설명

### 2.1 라이브 액티비티의 아키텍처 분리
라이브 액티비티는 메인 앱 타깃(Main App Target)과 위젯 확장 타깃(Widget Extension Target)의 협업으로 동작합니다.

| 역할 | 담당 프레임워크 | 실행 프로세스 | 주요 작업 |
| :--- | :--- | :--- | :--- |
| **생명주기 및 데이터 제어** | `ActivityKit` | 메인 앱 프로세스 | 액티비티 시작(request), 갱신(update), 종료(end), APNs 푸시 토큰 발급 |
| **UI 렌더링** | `WidgetKit`, `SwiftUI` | 위젯 확장 프로세스 | 잠금 화면 배너 뷰, Dynamic Island(Compact, Minimal, Expanded) 뷰 구현 |

메인 앱 프로세스와 위젯 확장 프로세스는 샌드박스가 분리되어 실행됩니다. 메인 앱이 `ActivityKit`을 통해 데이터 모델을 전달하면, 운영체제(SpringBoard)가 해당 데이터를 위젯 확장 타깃으로 넘겨 화면에 렌더링합니다.

### 2.2 데이터 모델링 (`ActivityAttributes`)
라이브 액티비티의 데이터는 `ActivityAttributes` 프로토콜을 준수하는 구조체로 정의합니다. 데이터는 성격에 따라 두 가지로 분리됩니다.

1. **정적 데이터(Static Data)**: 액티비티가 실행되는 전체 시간 동안 변하지 않는 고유 정보(예: 주문 번호, 식당 상호명, 배달 품목 등). 구조체의 멤버 변수로 선언합니다.
2. **동적 데이터(Dynamic Data, `ContentState`)**: 실시간으로 갱신되는 가변 정보(예: 배달 단계, 남은 배달 시간, 드라이버의 현재 위치 등). `ActivityAttributes` 프로토콜 내부의 `ContentState` 연관 타입(Associated Type)으로 정의하며, `Codable`과 `Hashable`을 준수해야 합니다.

### 2.3 Dynamic Island 표시 형태
Dynamic Island 지원 기기에서는 화면 상태와 다른 앱의 실행 여부에 따라 3가지 형태로 자동 적응합니다.

- **Compact(단일 실행 컴팩트)**: 단일 액티비티가 실행 중일 때 섬의 좌측(Leading)과 우측(Trailing) 영역을 나누어 핵심 정보를 간략히 표시합니다.
- **Minimal(다중 실행 미니멀)**: 둘 이상의 앱이 라이브 액티비티를 실행할 때 우선순위가 낮은 액티비티는 원형의 작은 인디케이터로 축소되어 표시됩니다.
- **Expanded(확장 뷰)**: 사용자가 Dynamic Island를 길게 탭(Long Press)하면 화면 상단에 큰 팝업 형태로 확장되어 상세 정보와 조작 버튼을 표시합니다.

---

## 3. 코드 구현 및 라인별 상세 분석

### 3.1 프로젝트 설정 (`Info.plist`)
라이브 액티비티를 활성화하기 위해 메인 앱 타깃의 `Info.plist`에 다음 키를 등록해야 합니다.

```xml
<key>NSSupportsLiveActivities</key>
<true/>
```

이 설정이 누락되면 런타임에 액티비티 요청 시 시스템 에러가 발생하며 액티비티가 생성되지 않습니다.

### 3.2 데이터 모델 정의 (`DeliveryActivityAttributes.swift`)
메인 앱과 위젯 확장 타깃 모두에서 접근할 수 있도록 타깃 멤버십(Target Membership)을 양쪽 모두에 체크해야 합니다.

```swift
import Foundation
import ActivityKit

// 1. ActivityAttributes 프로토콜을 준수하는 모델 정의
struct DeliveryActivityAttributes: ActivityAttributes {
    
    // 2. 동적 데이터(실시간 갱신 값) 정의: ContentState 구조체
    public struct ContentState: Codable, Hashable {
        var statusText: String          // 현재 배달 상태 (예: "조리 중", "배달 중")
        var estimatedDeliveryTime: Date // 예상 도착 시간
        var progress: Double            // 진행률 (0.0 ~ 1.0)
    }

    // 3. 정적 데이터(생명주기 동안 고정된 값) 정의
    var orderNumber: String             // 고유 주문 번호
    var restaurantName: String          // 식당 이름
}
```

- `ContentState`는 실시간으로 전송되는 페이로드의 형식을 결정합니다. APNs를 통한 원격 업데이트 시 JSON 구조가 이 구조체의 필드와 일치해야 합니다.
- 고정값인 `orderNumber`와 `restaurantName`은 액티비티 시작 시 1회만 메인 메모리에 할당되므로 매 업데이트마다 불필요한 네트워크 대역폭을 낭비하지 않습니다.

### 3.3 위젯 인터페이스 구현 (`DeliveryLiveActivity.swift`)
위젯 확장(Widget Extension) 타깃에 선언형 UI를 작성합니다.

```swift
import SwiftUI
import WidgetKit
import ActivityKit

struct DeliveryLiveActivity: Widget {
    var body: some WidgetConfiguration {
        // 1. 액티비티 전용 Configuration 선언
        ActivityConfiguration(for: DeliveryActivityAttributes.self) { context in
            // 2. 잠금 화면(Lock Screen) 및 AOD 렌더링 뷰
            LockScreenLiveActivityView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.8))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            // 3. Dynamic Island 렌더링 구성
            DynamicIsland {
                // 3.1 확장(Expanded) 상태 레이아웃
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.restaurantName, systemImage: "bag.fill")
                        .font(.caption)
                        .foregroundColor(.primary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...context.state.estimatedDeliveryTime, countsDown: true)
                        .font(.caption)
                        .foregroundColor(.orange)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.state.statusText)
                            .font(.headline)
                        ProgressView(value: context.state.progress)
                            .tint(.orange)
                    }
                    .padding(.horizontal)
                }
            } compactLeading: {
                // 3.2 컴팩트 좌측 레이아웃
                Image(systemName: "bag.fill")
                    .foregroundColor(.orange)
            } compactTrailing: {
                // 3.3 컴팩트 우측 레이아웃
                Text(context.state.statusText)
                    .font(.caption2)
                    .bold()
            } minimal: {
                // 3.4 미니멀(원형 축소) 레이아웃
                Image(systemName: "bag.fill")
                    .foregroundColor(.orange)
            }
            .keylineTint(Color.orange)
        }
    }
}

// 4. 잠금 화면 배너 전용 서브뷰
struct LockScreenLiveActivityView: View {
    let context: ActivityViewContext<DeliveryActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(context.attributes.restaurantName)
                    .font(.headline)
                    .foregroundColor(.white)
                Spacer()
                Text("주문번호: \(context.attributes.orderNumber)")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            HStack {
                Text(context.state.statusText)
                    .font(.subheadline)
                    .foregroundColor(.orange)
                Spacer()
                Text(context.state.estimatedDeliveryTime, style: .time)
                    .font(.subheadline)
                    .bold()
                    .foregroundColor(.white)
            }
            
            ProgressView(value: context.state.progress)
                .progressViewStyle(LinearProgressViewStyle(tint: .orange))
        }
        .padding()
    }
}
```

- `ActivityConfiguration(for:)`는 메인 앱이 시작한 액티비티의 데이터 타입과 바인딩되는 진입점입니다.
- `context.attributes`를 통해 불변 정적 값에 접근하고, `context.state`를 통해 동적으로 갱신되는 상태 값에 접근합니다.
- `Text(timerInterval:countsDown:)` 뷰를 사용하면 프로세스가 유휴(Idle) 상태에 들어가더라도 시스템 타이머를 통해 초 단위 카운트다운을 자체 렌더링하므로 추가 전력 소모 없이 실시간 UI를 유지합니다.

### 3.4 메인 앱에서의 생명주기 제어 (`DeliveryActivityManager.swift`)
메인 앱 타깃에서 액티비티를 요청, 갱신, 종료하는 관리 클래스입니다.

```swift
import Foundation
import ActivityKit

final class DeliveryActivityManager {
    static let shared = DeliveryActivityManager()
    private var currentActivity: Activity<DeliveryActivityAttributes>?

    private init() {}

    // 1. 액티비티 시작 요청
    func startDeliveryActivity(orderNumber: String, restaurantName: String) {
        // 1.1 사용자의 라이브 액티비티 허용 여부 사전 검증
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("라이브 액티비티가 비활성화되어 있습니다.")
            return
        }

        let attributes = DeliveryActivityAttributes(
            orderNumber: orderNumber,
            restaurantName: restaurantName
        )
        
        let initialContentState = DeliveryActivityAttributes.ContentState(
            statusText: "주문 접수 완료",
            estimatedDeliveryTime: Date().addingTimeInterval(1800), // 30분 후
            progress: 0.1
        )

        do {
            // 1.2 ActivityKit에 액티비티 요청 등록
            let activity = try Activity<DeliveryActivityAttributes>.request(
                attributes: attributes,
                contentState: initialContentState,
                pushType: .token // 원격 APNs 갱신을 사용할 경우 .token 지정
            )
            self.currentActivity = activity
            print("액티비티 등록 성공 ID: \(activity.id)")

            // 1.3 원격 푸시 토큰 스트림 관찰 (APNs 연동 시 필요)
            Task {
                for await pushToken in activity.pushTokenUpdates {
                    let tokenString = pushToken.map { String(format: "%02x", $0) }.joined()
                    print("라이브 액티비티 전용 푸시 토큰: \(tokenString)")
                    // 백엔드 서버로 푸시 토큰을 전송하는 로직을 수행합니다.
                }
            }
        } catch {
            print("액티비티 시작 실패: \(error.localizedDescription)")
        }
    }

    // 2. 액티비티 상태 갱신
    func updateDeliveryActivity(statusText: String, progress: Double, estimatedTime: Date) {
        guard let activity = currentActivity else { return }

        let updatedContentState = DeliveryActivityAttributes.ContentState(
            statusText: statusText,
            estimatedDeliveryTime: estimatedTime,
            progress: progress
        )

        Task {
            // 2.1 비동기 update 호출로 화면 상태 변경
            await activity.update(using: updatedContentState)
            print("액티비티 갱신 완료")
        }
    }

    // 3. 액티비티 종료
    func endDeliveryActivity(dismissalPolicy: ActivityUIDismissalPolicy = .default) {
        guard let activity = currentActivity else { return }

        let finalContentState = DeliveryActivityAttributes.ContentState(
            statusText: "배달 완료",
            estimatedDeliveryTime: Date(),
            progress: 1.0
        )

        Task {
            // 3.1 최종 상태 전달 및 종료 정책(즉시 삭제 or 지연 삭제) 적용
            await activity.end(using: finalContentState, dismissalPolicy: dismissalPolicy)
            self.currentActivity = nil
            print("액티비티 종료 완료")
        }
    }
}
```

- `ActivityAuthorizationInfo().areActivitiesEnabled`를 사전에 확인하여 사용자가 기기 설정에서 라이브 액티비티 기능을 껐을 때의 예외를 방어합니다.
- `pushType: .token`을 전달하면 개별 액티비티 세션 전용 푸시 토큰이 비동기로 발급됩니다. 이 토큰을 서버에 등록하면 앱이 완전 종료(Terminated)된 상태에서도 APNs를 통해 `ContentState`를 원격 갱신할 수 있습니다.
- `activity.end(using:dismissalPolicy:)`에서 `ActivityUIDismissalPolicy`를 지정합니다. `.immediate`는 즉시 화면에서 제거하고, `.default`는 잠금 화면에 기본 15분(최대 4시간) 동안 최종 상태를 유지한 뒤 제거합니다.

---

## 4. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 4.1 페이로드 용량 제한과 네트워크 제약
- **4KB 용량 한계**: 원격 APNs로 라이브 액티비티를 갱신할 때 `ContentState` JSON 페이로드 크기는 4KB를 초과할 수 없습니다. 대용량 텍스트나 인라인 이미지 바이너리는 전달할 수 없습니다.
- **이미지 렌더링 제약**: 라이브 액티비티 뷰는 SF Symbols나 위젯 에셋 카탈로그에 사전 포함된 이미지 위주로 구성해야 합니다. 네트워크 URL 이미지를 비동기로 다운로드하여 렌더링하는 작업은 지원되지 않습니다.

### 4.2 시스템 Throttling 및 업데이트 빈도 제한
- 과도한 빈도로 `update`를 호출하면 배터리 절약을 위해 운영체제가 업데이트 렌더링을 지연시키거나 무시(Throttling)합니다. 초 단위 갱신이 필요한 경우 뷰 내에서 `Text(timerInterval:)`을 사용하여 시스템 레벨 렌더링을 유도해야 합니다.

### 4.3 샌드박스 분리와 데이터 동기화
- 메인 앱과 위젯 확장은 서로 다른 프로세스이므로 싱글톤 객체나 전역 변수를 공유할 수 없습니다. 정적 데이터는 `ActivityAttributes`에 담고, 앱 간 파일 공유나 캐시 데이터가 필요하다면 App Groups(`UserDefaults(suiteName:)` 또는 공유 컨테이너 디렉토리)를 사용해야 합니다.

### 4.4 수명 주기(Time-to-Live) 관리
- 라이브 액티비티의 활성 수명은 최대 8시간입니다. 8시간이 지나면 시스템에 의해 자동으로 비활성화 상태가 되며, 이후 최대 4시간 동안 잠금 화면에 머무른 뒤 완전히 제거됩니다. 서버와 클라이언트는 세션 타임아웃 처리를 일치시켜야 합니다.

---

## 5. 결론 (해당 기술의 기대효과 요약)

라이브 액티비티는 실시간 상태 정보를 다수의 연속된 푸시 알림으로 파편화하지 않고, 단일 세션 기반의 일관된 위젯 인터페이스로 집약합니다. `ActivityKit`을 통한 간결한 생명주기 제어와 `SwiftUI` 기반의 반응형 선언형 UI를 결합함으로써 잠금 화면과 Dynamic Island 전반에 걸쳐 백그라운드 사용자 경험을 개선할 수 있습니다.
