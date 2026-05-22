# 2026-1-OSSP-2-Domino-04
외국인들을 위한 관광지 및 명소 추천 서비스

## Rule
본 프로젝트는 Forking Workflow를 기반으로 운영됩니다. 모든 개발은 develop 브랜치를 중심으로 이루어지며, 파트별 검증 후 최종 배포 시에만 main을 사용합니다.

  - ### Commit 양식         
      | 유형    |  tagname |
      | ----- | -------- |
      | 추가    | add      |
      | 삭제    | del      |
      | 수정    | mod      |
      | 버그 수정 | fix      |

    Default: `[ 파트명 | 본인이름 | 유형 ]` -> 항상 commit message 맨 앞에 붙어야 함.

  - ### Branch Structure
```
  main (Release)      : 최종 배포 및 서비스 운영
  └── develop (Dev)   : 모든 파트 코드가 합쳐지는 중심축 (Default)
       ├── frontend   : 프론트엔드 작업 통합 브랜치
       │    ├── feat/front-taehyeon
       │    └── feat/front-hyojun
       └── backend    : 백엔드 작업 통합 브랜치
            ├── feat/back-deokwon
            └── feat/back-jeongmin
```
  - ### Initial Setup (최초 1회): 팀 저장소를 본인 계정으로 Fork한 후, 로컬에서 아래 명령어를 실행합니다.
      #### 1. Fork한 본인 저장소 clone
      `git clone https://github.com/YourID/project-name.git`

      #### 2. 원본 팀 저장소를 upstream이라는 이름으로 연결 (동기화 용도)
      `git remote add upstream https://github.com/TeamName/project-name.git`

      #### 3. 본인 파트 브랜치 생성 및 이동 (예: 프론트엔드 태현)
      `git checkout -b feat/front-taehyeon`

  - ### ⚠️ 중요 규칙 (Must Read)
    - **타 파트와 연동 확인**: 로컬에서 `git pull upstream develop`을 실행하여 전체 코드를 가져와 테스트합니다.
    - **작업 범위**: 반드시 평소엔 본인 branch에서만 작업합니다!
    - **develop branch**: pull 제외하곤 절대 건드리지 않습니다!
    - **Conflict 발생 시**: 팀장에게 바로 알립니다.
    - **Commit format 통일**: 반드시 commit 양식을 준수합니다.

  - ### Daily Workflow (개발 진행): 작업을 시작하기 전과 완료한 후에는 반드시 아래 순서를 따릅니다.
    - #### GIT 작업 흐름
      - ##### 팀원
        ```
          # 1. 본인 branch로 이동
          git checkout {본인 branch명}
          git pull origin {본인 branch명}
          
          # 2. 작업 & 커밋
          git add .
          git commit -m "COMMIT MSG"
          
          # 3. 원격에 push
          git push origin {본인 branch명}
        ```
  
      - ##### PART 팀장(팀원 -> frontend/backend 통합)
         ```
          git checkout {파트 branch명}
          git pull origin {파트 branch명}

          # 팀원 branch를 파트 branch에 merge (얘는 그냥 참고 바람 ~ 기존 방식대로 github PR 활용할거임!)
          # Merge: 파트원 리뷰 후, 각 파트별 대표가 확인하여 팀 저장소에 반영합니다.
         
          git merge {팀원 branch명}
          git push origin {파트 branch명}
        ```
         
      - ##### 팀장(frontend/backend → develop 통합)
        ```
          git checkout develop
          git pull origin develop
        
          # Final Merge: 두 파트 모두 이상이 없다면, 팀장이 최종적으로 develop branch에 Merge 합니다.

          # frontend → develop 반영
          git subtree merge --prefix=FrontEnd frontend
          git push origin develop
          
          # backend → develop 반영
          git subtree merge --prefix=BackEnd backend
          git push origin develop
        ```

      - ##### 전체 흐름 요약
        ```
        frontend/feat/front-taehyeon ──┐
          frontend/feat/front-hyojun ──┼── merge ──▶ frontend ──┐
                                                                 ├── subtree merge ──▶ develop
            backend/feat/back-deokwon ──┼── merge ──▶ backend ──┘
           backend/feat/back-jeongmin ──┘
        ```
        
    - #### ISSUE 생성
      1. Title의 경우 `[Week n] - {해당 주차에 구현할 파트명}`
      2. Description에 내용 간단히 요약해서 작성 - 이건 파트별로 format 통일하면 좋을 것 같다.
      3. Assignees에 참여한 사람 모두 포함시키기
      4. label의 경우 자유(하는 걸 추천함)
        
    - #### PR(Pull Request) 생성: GitHub 웹페이지에서 Compare & pull request 버튼 클릭
      - **base repository**: TeamName/project-name (base: frontend 또는 backend)
      - **head repository**: YourID/project-name (compare: feat/본인이름)
      - **others**
        - Reviewer의 경우 파트장 또는 팀장 포함시키기
        - Assignees의 경우 ISSUE 생성시와 동일
        - Development에서 앞서 만든 ISSUE 검색해서 해당 ISSUE와 연결
