问题1： 是靠瞬时捕获来判断正误的，现在问题是我点下一题之后根本不会刷新，如图所示，题目编号还停留在上一道题，这就是问题所在
v2.0 第一个问题已解决,目前需要搞清楚切题逻辑，为什么切题的时候无法更新答对or答错状态历史，还停留在上一个对错情况的行为？
问题记录如下：
![alt text](pic/image.png) 目前显示正常，切题后显示：![alt text](pic/image-1.png)，对错状态仍然会停留在上一个题目，但是如果做对or做错会改变这一状态。
目前该问题已经解决，应该去开发做题模式or浏览模式了。
要求2：你采取的逻辑应该是记录这个编号，只要这个编号做对或者做错了永不改变，但实际上如果切完题或者刷新后不应该显示我已做对。现在最好需要增加一个解题历史，我在不切题的情况下肯定是按照逻辑锁存这个结果，当我切题或者刷新之后应该状态变为未作答，但是显示历史答题记录（该题几对几错）
目前有bug，当我做对一道题之后，切下一道题在等几秒钟后会自动判对，我截到的记录如图所示：
```
101围棋助手: Content Script 已加载
inject.js:2 101围棋助手 v6.0 已注入...
inject.js:100 [SCAN] Q=76920 | 上次Q=undefined | isNewProblem=false | isFirstLoad=true | 上次结果=undefined
inject.js:114 [SCAN] 新题/刷新 → 强制重置状态为未作答(0)
content.js:274 【助手】来源: GLOBAL_qqdata | 结果: 0 | 新结果: undefined
inject.js:100 [SCAN] Q=76920 | 上次Q=76920 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-76920] Alpine store 快照: {duizhanResult: -1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:71 [Q-76920] 所有来源均无明确结果，fallbackZero = 0
145dd8d93025971c31d78edb45dd42e853.js:1 no qpRect
alpine.min.js:5 [Intervention]Images loaded lazily and replaced with placeholders. Load events are deferred. See https://go.microsoft.com/fwlink/?linkid=2048113
55dd8d93025971c31d78edb45dd42e853.js:1 no qpRect
inject.js:100 [SCAN] Q=76920 | 上次Q=76920 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-76920] Alpine store 快照: {duizhanResult: -1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:71 [Q-76920] 所有来源均无明确结果，fallbackZero = 0
25dd8d93025971c31d78edb45dd42e853.js:1 no qpRect
inject.js:100 [SCAN] Q=76920 | 上次Q=76920 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-76920] Alpine store 快照: {duizhanResult: -1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:71 [Q-76920] 所有来源均无明确结果，fallbackZero = 0
inject.js:100 [SCAN] Q=76920 | 上次Q=76920 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-76920] Alpine store 快照: {duizhanResult: -1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:71 [Q-76920] 所有来源均无明确结果，fallbackZero = 0
inject.js:100 [SCAN] Q=76920 | 上次Q=76920 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-76920] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-76920] 结果来源: duizhanResult = 1
content.js:274 【助手】来源: GLOBAL_qqdata | 结果: 1 | 新结果: true
content.js:151 【历史记录】更新 Q-76920，对:2 错:0
inject.js:100 [SCAN] Q=76920 | 上次Q=76920 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-76920] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-76920] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=76920 | 上次Q=76920 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-76920] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-76920] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=76920 | 上次Q=76920 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-76920] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-76920] 结果来源: duizhanResult = 1
content.js:274 【助手】来源: XHR | 结果: null | 新结果: false
content.js:180  Uncaught (in promise) DataError: Failed to execute 'get' on 'IDBObjectStore': No key or key range specified.
    at content.js:180:31
    at new Promise (<anonymous>)
    at getProblemHistory (content.js:177:16)
    at async content.js:279:33
(匿名) @ content.js:180
getProblemHistory @ content.js:177
await in getProblemHistory
(匿名) @ content.js:279
postMessage
(匿名) @ inject.js:247
XMLHttpRequest.send
XMLHttpRequest.send @ inject.js:257
(匿名) @ VM9068 axios.min.js:1
xhr @ VM9068 axios.min.js:1
ze @ VM9068 axios.min.js:1
value @ VM9068 axios.min.js:1
(匿名) @ VM9068 axios.min.js:1
h @ VM9068 axios.min.js:1
(匿名) @ VM9068 axios.min.js:1
(匿名) @ VM9068 axios.min.js:1
i @ VM9068 axios.min.js:1
s @ VM9068 axios.min.js:1
(匿名) @ VM9068 axios.min.js:1
n @ VM9068 axios.min.js:1
u.value @ VM9068 axios.min.js:1
Q.forEach.Xe.<computed> @ VM9068 axios.min.js:1
(匿名) @ VM9068 axios.min.js:1
getTopic @ 5dd8d93025971c31d78edb45dd42e853.js:1
loadNewTopic @ 5dd8d93025971c31d78edb45dd42e853.js:1
onGoTopic @ 5dd8d93025971c31d78edb45dd42e853.js:1
Ie @ alpine.min.js:5
(匿名) @ alpine.min.js:5
fr @ alpine.min.js:1
(匿名) @ alpine.min.js:5
o @ alpine.min.js:5
(匿名) @ alpine.min.js:5
(匿名) @ alpine.min.js:5
W @ alpine.min.js:1
[Alpine] $dispatch('gotopic', 1) @ VM9132:3
(匿名) @ alpine.min.js:5
fr @ alpine.min.js:1
(匿名) @ alpine.min.js:5
o @ alpine.min.js:5
(匿名) @ alpine.min.js:5
(匿名) @ alpine.min.js:5
inject.js:100 [SCAN] Q=75641 | 上次Q=76920 | isNewProblem=true | isFirstLoad=false | 上次结果=1
inject.js:114 [SCAN] 新题/刷新 → 强制重置状态为未作答(0)
content.js:274 【助手】来源: GLOBAL_qqdata | 结果: 0 | 新结果: false
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:30 [Q-75641] [Grace期] 跳过 duizhanResult，剩余 1468ms
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:71 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:30 [Q-75641] [Grace期] 跳过 duizhanResult，剩余 1297ms
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:71 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:30 [Q-75641] [Grace期] 跳过 duizhanResult，剩余 900ms
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:71 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
content.js:274 【助手】来源: GLOBAL_qqdata | 结果: 1 | 新结果: true
content.js:166 【历史记录】新增 Q-75641，对:1 错:0
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
inject.js:100 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:54 [Q-75641] 结果来源: duizhanResult = 1
```
这个锁始终没有在切题后解开，他把我做的题目也当成了脏数据：（浏览模式下）
```
101围棋助手: Content Script 已加载
inject.js:2 101围棋助手 v6.0 已注入...
inject.js:112 [SCAN] Q=75641 | 上次Q=undefined | isNewProblem=false | isFirstLoad=true | 上次结果=undefined
inject.js:127 [SCAN] 新题/刷新 → 强制重置状态为未作答(0)，进入 PENDING 锁
content.js:275 【助手】来源: GLOBAL_qqdata | 结果: 0 | 新结果: undefined
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:58 [Q-75641] 观察到中间态，解除 PENDING 锁
inject.js:83 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
75641/:1 [Intervention]Images loaded lazily and replaced with placeholders. Load events are deferred. See https://go.microsoft.com/fwlink/?linkid=2048113
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:83 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:83 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:83 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:83 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:83 [Q-75641] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:66 [Q-75641] 结果来源: duizhanResult = 1
content.js:275 【助手】来源: GLOBAL_qqdata | 结果: 1 | 新结果: true
content.js:151 【历史记录】更新 Q-75641，对:3 错:0
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:66 [Q-75641] 结果来源: duizhanResult = 1
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:66 [Q-75641] 结果来源: duizhanResult = 1
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:66 [Q-75641] 结果来源: duizhanResult = 1
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:66 [Q-75641] 结果来源: duizhanResult = 1
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: Object
inject.js:66 [Q-75641] 结果来源: duizhanResult = 1
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:66 [Q-75641] 结果来源: duizhanResult = 1
inject.js:112 [SCAN] Q=75641 | 上次Q=75641 | isNewProblem=false | isFirstLoad=false | 上次结果=1
inject.js:49 [Q-75641] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:66 [Q-75641] 结果来源: duizhanResult = 1
content.js:275 【助手】来源: XHR | 结果: null | 新结果: false
inject.js:112 [SCAN] Q=21878 | 上次Q=75641 | isNewProblem=true | isFirstLoad=false | 上次结果=1
inject.js:127 [SCAN] 新题/刷新 → 强制重置状态为未作答(0)，进入 PENDING 锁
content.js:275 【助手】来源: GLOBAL_qqdata | 结果: 0 | 新结果: false
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:30 [Q-21878] [Grace期] 跳过 duizhanResult，剩余 1468ms
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:30 [Q-21878] [Grace期] 跳过 duizhanResult，剩余 1389ms
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:30 [Q-21878] [Grace期] 跳过 duizhanResult，剩余 1294ms
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:30 [Q-21878] [Grace期] 跳过 duizhanResult，剩余 382ms
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 2, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 2
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
inject.js:112 [SCAN] Q=21878 | 上次Q=21878 | isNewProblem=false | isFirstLoad=false | 上次结果=0
inject.js:49 [Q-21878] Alpine store 快照: {duizhanResult: 1, taskinfo.result: 0, answerResult: 0, qqdata.myan.result: undefined}
inject.js:61 [Q-21878] 处于 PENDING 锁，忽略脏数据: 1
inject.js:83 [Q-21878] 所有来源均无明确结果，fallbackZero = 0
```
这是结果：发给GPT看看：
```
﻿
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:41.592Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:41.901Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:42.196Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:42.494Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:42.798Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:43.105Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:43.402Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:43.696Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:44.007Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
VM13811:37 [SNAP] 
{tag: 'tick', t: '2026-02-22T06:13:44.293Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
__qipanWatch.stop()
VM13811:61 [watch] 已停止
undefined
__qipanWatch.snap('after-next')
VM13811:37 [SNAP] 
{tag: 'after-next', t: '2026-02-22T06:13:51.507Z', qid_url: '21870', duizhanResult: 1, answerResult: 0, …}
VM13811:47 
{core: {…}, flat: {…}}
__qipanWatch.snap('after-first-move')
VM13811:37 [SNAP] 
{tag: 'after-first-move', t: '2026-02-22T06:14:01.827Z', qid_url: '21870', duizhanResult: 2, answerResult: 0, …}
VM13811:47 
(索引)
key
from
to
0	'resultTip'	'答对啦！真棒！'	'再认真想想'
1	'duizhanResult'	1	2
Array(2)
{core: {…}, flat: {…}}
```
接下来：
```
﻿
VM13811:47 
(索引)
key
from
to
0	'qipanWidth'	587	496.7368421052632
1	'levelname'	'13K'	'13K+'
2	'nextUrl'	'/go/getlevelnextquestion/13K/21870/'	'/go/getlevelnextquestion/13K/12133/'
3	'prevUrl'	'/go/getlevelprevquestion/13K/21870/'	'/go/getlevelprevquestion/13K/12133/'
4	'qqdata.id'	21870	12133
5	'qqdata.qid'	21870	12133
6	'qqdata.publicid'	21870	12133
7	'qqdata.levelname'	'13K'	'13K+'
8	'qqdata.userid'	1465	1
9	'qqdata.username'	'苍鹰翔宇'	'admin'
10	'qqdata.sms_count'	2	4
11	'qqdata.bookinfos'	'[array:0]'	'[array:3]'
12	'qqdata.taskresult.ok_total'	34250	35638
13	'qqdata.taskresult.fail_total'	14667	10426
14	'qqdata.vote'	4.8	4.3
15	'qqdata.name'	'黑先做活'	''
16	'qqdata.title'	'选自《围棋进阶读本——梅之篇》'	'黑先净活'
17	'qqdata.c'	'amsTUEEQHRATU0EQHRATUUAQHRATU0AQHRATUEMQHRATU0IQHR…TXhIdEhBWXxIdEhBQXxIdEhBTXxIdEhBWXBIdEhBRXBJsbw=='	'amsTQFMQHRATQFAQHRATQFEQHRATQFYQHRATQFcQbBwRaRBDUB…DUhIdEhBDVRIdEhBBVBIdEhBDVBIdEhBAVxIdEhBAVhJsbw=='
18	'qqdata.xv'	5	9
19	'qqdata.andata.1.pt'	'qc'	'sb'
20	'qqdata.andata.2.pt'	'pc'	'sf'
21	'qqdata.andata.3.pt'	'pb'	'sd'
22	'qqdata.andata.3.tip'	'RIGHT'	''
23	'qqdata.andata.4.pt'	'pb'	'sd'
24	'qqdata.andata.5.pt'	'pc'	'sf'
25	'qqdata.andata.6.pt'	'pb'	'sd'
26	'qqdata.andata.7.pt'	'qc'	'sb'
27	'qqdata.andata.8.pt'	'pc'	'sf'
28	'qqdata.andata.9.pt'	'qc'	'sb'
29	'qqdata.disuse'	5	9
30	'qqdata.sx'	9	5
31	'qqdata.sy'	6	9
32	'qqdata.pos_x1'	10	14
33	'qqdata.pos_y2'	5	8
34	'qqdata.ru'	2	1
35	'qqdata.level'	-51	-50
36	'qqdata.desc'	'选自《围棋进阶读本——梅之篇》'	'黑先净活'
37	'qqdata.yes_count'	34250	35638
38	'qqdata.no_count'	14667	10426
39	'qqdata.comments'	'[array:19]'	'[array:17]'
40	'qipanFontSize'	29.35	24.83684210526316
41	'qindex'	2	3
Array(42)
{core: {…}, flat: {…}}
__qipanWatch.snap('after-1s')
VM13811:37 [SNAP] 
{tag: 'after-1s', t: '2026-02-22T06:16:35.035Z', qid_url: '12133', duizhanResult: 2, answerResult: 0, …}
VM13811:47 
{core: {…}, flat: {…}}
__qipanWatch.snap('after-first-move')
VM13811:37 [SNAP] 
{tag: 'after-first-move', t: '2026-02-22T06:16:44.035Z', qid_url: '12133', duizhanResult: 0, answerResult: 0, …}
VM13811:47 
(索引)
key
from
to
0	'simulatorDuizhanPts'	'[array:0]'	'[array:2]'
1	'duizhanResult'	2	0
2	'musthideFirstMoveDone'	false	true
Array(3)
{core: {…}, flat: {…}}
﻿
Selection deleted
```