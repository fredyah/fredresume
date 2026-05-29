window.INTERVIEW_QA_CONTENT = [
  {
    "id": "q1",
    "title": "Q1. 緊急事故：線上服務大規模超時",
    "subtitle": "週五流量高峰時，核心交易 API 大量出現 HTTP 504 Gateway Timeout。",
    "tags": [
      "Incident Response",
      "SRE",
      "Kubernetes",
      "RCA"
    ],
    "question": [
      "您是某電商平台的 DevOps 工程師。在週五下午的流量高峰期，監控系統突然發出大量警報，顯示核心交易服務的 API 回應時間急遽拉長，大量用戶回報頁面載入失敗或超時。",
      "請說明您會如何處理、排查、止血、對外溝通，並在服務恢復後完成根因分析。"
    ],
    "answer": [
      {
        "heading": "回答重點",
        "body": [
          "面對星期五流量高峰時核心交易 API 大量出現504，我會把處理分成四個階段：事故指揮、影響範圍確認、快速止血、根因分析與預防復發。",
          "第一時間我會建立 incident channel ，也就是事件處理頻道，看我們是用 Line , discord, telegram，或是其他的 message app，拉進後端、DBA、SRE、客服或營運窗口，並指定一位 incident commander ，也就是「事件處理指揮官」， 統一決策，避免多人同時修改設定造成二次事故。同時確認影響範圍：是全站 504，還是只有結帳、付款、購物車等核心 API；是所有地區都受影響，還是特定 ingress、namespace、node 或服務；並同步查看 Five-hundred error rate、latency 情況、request volume、錯誤開始時間，以及最近是否有 deploy 新部署版耕、config change 配置修改 或 DB migration、DB 的其他操作。",
          "技術排查我會從流量入口往後看。第一層先看 Nginx Ingress 、 application load balancer、 API Gateway 的504 數量、upstream latency、upstream response time。如果 Ingress 有 五零四，但後端 Pod access log 沒有收到 request，問題可能在 Ingress、Service、Endpoint、DNS、NetworkPolicy 或 Kubernetes 網路。如果 Pod 有收到 request 但處理很久，就會往 API 本身、DB、Redis 或第三方服務排查。"
        ]
      },
      {
        "heading": "實際排查指令",
        "code": {
          "lang": "bash",
          "text": "# 先看核心服務 Pod 狀態與是否有重啟、OOM、Pending\nkubectl -n prod get pod -o wide\nkubectl -n prod get events --sort-by=.lastTimestamp | tail -50\n\n# 查看核心 API 的 HPA 是否真的有擴容\nkubectl -n prod get hpa\nkubectl -n prod describe hpa checkout-api\n\n# 確認 Service endpoint 是否正常\nkubectl -n prod get svc,endpoints checkout-api\n\n# 查看 Ingress controller 近期 504 與 upstream timeout log\nkubectl -n ingress-nginx logs deploy/ingress-nginx-controller --since=30m | grep -E \"504|upstream timed out\"\n\n# 查看核心服務日誌\nkubectl -n prod logs deploy/checkout-api --since=30m --tail=300"
        },
        "body": [
          "第二層我會看 Kubernetes 資源狀態，確認核心交易 API 的 Pod 是否有被 O.O.M. Killed，也就是記憶體不足而被系統強制終止；是否出現 CrashLoopBackOff，也就是容器一直啟動失敗、反覆重啟；同時檢查 CPU 和 memory 使用率是否已經打滿，HPA，也就是 Horizontal Pod Autoscaler，自動水平擴容機制是否有正常增加 Pod 數量，以及 Node 節點本身是否有 CPU、記憶體或磁碟壓力。",
          "如果我看到 HPA 的 desired replicas，也就是系統希望擴到的 Pod 數量已經上升，但 current replicas，也就是實際跑起來的 Pod 數量沒有增加，我會進一步檢查幾個方向。第一是 node capacity，也就是節點剩餘資源是否足夠；第二是 scheduler，也就是 Kubernetes 排程器是否能把 Pod 排到合適節點；第三是 image pull，確認映像檔是否拉取失敗；第四是 resource quota，也就是 namespace 的資源配額是否限制了擴容；另外也會看 PDB、affinity 和 taint。PDB 是 Pod Disruption Budget，用來限制可被中斷的 Pod 數量；affinity 是親和性規則，會影響 Pod 被排到哪些節點；taint 則是節點污點，可能會阻止某些 Pod 被排上去。",
          "第三層我會看資料層與相依服務。資料庫方面，我會檢查 connection pool，也就是應用程式和資料庫之間的連線池是否耗盡；active connection，目前活躍連線數是否過高；slow query，是否有慢查詢拖慢整體回應；lock wait 和 deadlock，也就是資料庫鎖等待或死鎖問題；另外也會看資料庫 CPU、IOPS，也就是磁碟每秒讀寫次數，以及 replication lag，主從資料同步延遲。",
          "Redis 方面，我會看 latency，也就是回應延遲；memory，記憶體使用率；evicted keys，是否因為記憶體不足導致 key 被淘汰；blocked clients，是否有客戶端被阻塞；以及 hit rate，也就是快取命中率。如果系統有串接第三方服務，我也會檢查外部 API 的 latency、timeout rate 和 retry 數量，也就是外部服務回應時間、逾時比例與重試次數，避免因為大量重試形成 retry storm，也就是重試風暴，反而把自己的服務、資料庫或外部服務一起拖垮。"
        ]
      },
      {
        "heading": "止血與復盤",
        "body": [
          "止血方面，我不會一開始就盲目 scale out，而是會先判斷瓶頸。如果是新版造成，會優先 rollback 並暫停 deploy。如果是 API CPU 打滿且 DB 還健康，可以手動 scale out。如果瓶井在 DB，盲目增加 Pod 可能讓 DB connection 更滿，這時會優先限流、關閉非核心功能、降低推薦、報表或高成本查詢，保住節帳與付款主流程。如果判斷是第三方服務變慢，我會先加上 timeout，也就是請求等待上限，避免核心 API 一直卡住。接著會啟用 circuit breaker 熔斷機制，當外部服務錯誤率太高時，先暫停呼叫它，避免問題擴大。如果這個第三方功能不是交易必要流程，就會走 fallback 備援處理，例如改用快取資料、回傳預設結果，或把任務先丟到 queue 延後處理。必要時也會暫時降級，先關閉或簡化非核心功能，優先保住結帳、付款等核心流程。。必要時也會在 Ingress 或 API Gateway 做 rate limiting，擋掉惡意重試或過量流量。",
          "對外回報上，我會固定節奏同步目前影響範圍、已採取措施、下一步與風險，不會在還沒確認前猜測 root cause。服務恢復後，我會保留 metrics、logs、slow query、deployment record，並在 24 到 72 小時內完成 RCA。RCA 會包含時間線、直接原因、根本原因、為什麼監控沒有更早發現、為什麼系統沒有自動降級，以及後續 action items，例如補告警、補 dashboard、調整 timeout / retry。必要時也會啟用 OpenTelemetry、Jaeger、Tempo 或 APM，用 trace ID 串起 Ingress、API、DB、Redis 與第三方服務的耗時，快速確認 latency 是卡在哪一段，避免只靠單點 log 猜測問題。"      
        ]
      },
      {
        "heading": "其他處理",
        "quote": "我會避免在瓶頸未確認前盲目擴容，因為如果真正瓶頸在 DB 或第三方服務，scale out API Pod 反而可能放大連線數與 retry storm，讓事故惡化。"
      }
    ]
  },
  {
    "id": "q2",
    "title": "Q2. 挑戰：在客戶的無網路環境中部署系統",
    "subtitle": "Air-gapped environment：所有軟體、Docker images、套件都必須一次性帶入機房。",
    "tags": [
      "Air-Gap",
      "Terraform",
      "Ansible",
      "RKE2",
      "Supply Chain"
    ],
    "question": [
      "公司需要將一套複雜的微服務系統部署到一個重要客戶的本地機房。該機房出於安全考量，完全沒有對外網路連線。",
      "請說明如何設計高擬真度的模擬環境，以及在無網路環境中如何自動化部署、處理變數與密鑰管理。"
    ],
    "answer": [
      {
        "heading": "整體策略",
        "body": [
          "在真正進入 無網路環境之前，必須先在有網路的區域完成前置準備，包含 dependency convergence，也就是依賴套件收斂；security scanning，也就是安全掃描；version control，也就是版控管理；artifact signing，也就是產物簽章；以及 packaging，也就是離線打包。進到無網路環境後，就不能再依賴外部下載，例如 docker.io、GitHub、apt repo 或其他外部 API。",
          "在公司內部雲端模擬環境中，我會用 Terraform，建立一個高擬真度的 isolated VPC，也就是隔離型私有網路。這個 VPC 會包含 private subnet，也就是不直接對外公開的私有子網；deployer node；Kubernetes nodes；內部 registry；Nexus / Artifactory，也就是內部套件與 artifact repository (或用 apt-offline 做為替代方案)；GitLab / Gitea，也就是內部程式碼版控平台；以及 DNS、NTP、內部 CA 等基礎服務。",
          "網路設計上，我會刻意不建立 NAT Gateway，也就是不提供 private subnet 對外上網的出口；也不讓 route table，也就是路由表，出現 0.0.0.0/0 指向 Internet Gateway 的預設路由。換句話說，這個環境不能直接連到 Internet。",
          "同時，Security Group，也就是安全群組，和 NACL，也就是 Network ACL、子網層級的網路存取控制，也會限制 egress outbound traffic，也就是對外連線流量，只能連到內部 CIDR 網段。這樣可以確保 VM 無法直接存取 docker.io、GitHub、apt repo 或外部 API，逼近真正 air-gapped environment，也就是無網路隔離環境的限制。"
        ]
      },
      {
        "heading": "Terraform 網路隔離示意",
        "code": {
          "lang": "hcl",
          "text": "resource \"aws_route_table\" \"airgap_private_rt\" {\n  vpc_id = aws_vpc.airgap.id\n\n  route {\n    cidr_block = \"10.10.0.0/16\"\n    gateway_id = \"local\"\n  }\n}\n\nresource \"aws_security_group\" \"airgap_vm_sg\" {\n  name   = \"airgap-vm-sg\"\n  vpc_id = aws_vpc.airgap.id\n\n  ingress {\n    from_port   = 22\n    to_port     = 22\n    protocol    = \"tcp\"\n    cidr_blocks = [\"10.10.10.0/24\"]\n  }\n\n  egress {\n    from_port   = 0\n    to_port     = 0\n    protocol    = \"-1\"\n    cidr_blocks = [\"10.10.0.0/16\"]\n  }\n}"
        }
      },
      {
        "heading": "自動化部署流程",
        "body": [
          "部署工具上，我會使用 Ansible 作為主要自動化部署工具。原因是 Ansible 是 agentless，只要 SSH 可通就能操作，適合客戶內網或地端機房；同時具備 idempotency，部署失敗後可以修正問題再重跑，不容易讓環境狀態變得不可控。如果是雲端或私有雲 API 可以對接的環境，Terraform 會負責 VM、subnet、disk、security group 等基礎設施；但進入真正的 offline deploy 階段，主要會由 Ansible 接手。"
        ],
        "code": {
          "lang": "yaml",
          "text": "- name: Bootstrap air-gapped Kubernetes nodes\n  hosts: k8s_nodes\n  become: true\n  roles:\n    - os-hardening\n    - local-repo\n    - container-runtime\n    - rke2-install\n    - registry-config\n    - kubeconfig\n    - smoke-test"
        }
      },
      {
        "heading": "Artifacts 與內部倉庫",
        "body": [
          "Online 階段會由 CI/CD 產生 offline bundle。內容包含 OS 套件，例如 .deb / .rpm；Kubernetes 發行版安裝檔，例如 RKE2 air-gap artifacts；container images，例如透過 docker save、ctr images export 或 skopeo copy 匯出；還有 Helm chart、values.yaml、CRD、Kustomize overlay、部署腳本、版本 manifest、checksum ...。",
          "套件與 image 會在內部建立私有倉庫。容器映像檔放 registry，APT / YUM / PyPI / npm / Helm chart 可以放 Nexus 或 Artifactory。Kubernetes 節點不直接連外，而是透過內部 registry 與 local package repo 取得依賴。對 RKE2 這類 air-gap 友善的發行版，可以把 image tarball 放到指定目錄，由 RKE2 / containerd 匯入，並用 registries.yaml 指向內部 registry。"
        ]
      },
      {
        "heading": "部署前驗證",
        "body": [
          "應用部署層我會使用 Helm 或 Kustomize。所有 image repository 都會在 values 或 overlay 裡改成內部 registry 位址，避免 runtime 才去拉 docker.io、gcr.io 或 ghcr.io。部署前會先做 helm template 或 kustomize build，掃描 YAML 裡是否還殘留外部 registry、外部 URL 或未打包的 image。"
        ],
        "code": {
          "lang": "bash",
          "text": "helm template myapp ./charts/myapp -f values-airgap.yaml > rendered.yaml\ngrep -RIE \"docker.io|gcr.io|ghcr.io|quay.io|github.com\" rendered.yaml ./manifests || true\n\n# 驗證不能連外\ncurl -I https://docker.io --connect-timeout 5\ncurl -I https://registry-1.docker.io --connect-timeout 5\ncurl -I https://github.com --connect-timeout 5\n\n# 驗證只能連內部服務\ncurl -k https://harbor.airgap.local\ncurl http://nexus.airgap.local:8081\ncurl http://gitlab.airgap.local"
        }
      },
      {
        "heading": "Secret 與風險控管",
        "body": [
          "如果環境允許 GitOps，我會在 air-gap 內部架 GitLab 或 Gitea，再部署 Argo CD。Argo CD 不會連外部 GitHub，而是同步內部 Git Server 裡的 manifests。這樣即使是無網路環境，也可以保留 GitOps 的版本控管、差異比對與回滾能力。",
          "Secret 管理會分兩層。部署期 secret 可以用 Ansible Vault 或 SOPS 保護；Kubernetes runtime secret 則可以用 SealedSecrets、Vault、External Secrets Operator 或 CSI Driver。重點是 secret 不能以明文散落在 bundle、Git repo 或 shell script 裡，而且密鑰應該有 rotation 與交接流程。",
          "這類部署最容易踩的坑是漏掉深層依賴，例如 initContainer image、Helm hook image、CRD controller image、pause image、CNI image、CSI image、CoreDNS image、metrics-server image，或 Python / npm 套件的 transitive dependency。所以我會用一份 artifact manifest 鎖定版本、digest、checksum 與來源，並在模擬 air-gap 環境中完整重跑一次，確保 bundle 可以從零部署成功。"
        ],
        "quote": "我會把 air-gap 部署當成一個 release engineering 問題來處理，不只是把檔案複製進去，而是要確保版本可追溯、依賴完整、可重複部署、可驗證、可回滾。"
      }
    ]
  },
  {
    "id": "q3",
    "title": "Q3. 高可用性 High Availability 架構設計",
    "subtitle": "Django Service、Celery Worker、PostgreSQL、Elasticsearch 的 HA 設計。",
    "tags": [
      "High Availability",
      "Django",
      "Celery",
      "PostgreSQL",
      "Elasticsearch"
    ],
    "question": [
      "請設計 Django Service + Celery Worker 的高可用架構。",
      "請設計 PostgreSQL 高可用架構。",
      "請設計 Elasticsearch 高可用架構。"
    ],
    "answer": [
      {
        "heading": "整體原則",
        "body": [
          "我會把 H.A.（高可用性）設計分成三層：應用層、資料庫層、搜尋層。",
          "應用層重點是 stateless（無狀態）、多副本、queue 隔離（用佇列分散背景任務） 與 graceful shutdown（優雅關閉，避免請求中斷）。",
          "PostgreSQL 重點是 replication（資料複寫）、automatic failover（自動故障切換）、connection pooling（連線池）、backup 或 P.I.T.R.（備份與時間點還原）。",
          "Elasticsearch 重點是 master quorum（主節點選舉機制）、shard replica（分片副本）、allocation awareness（分片分散到不同節點）、snapshot（快照備份） 與容量監控。"
        ]
      },
      {
        "heading": "Django Service + Celery Worker HA",
        "body": [
          "Django API 層會採多副本部署，前面放 Load Balancer、Nginx Ingress 或 API Gateway 分流。Django Pod 本身保持 stateless，session 放到 Redis，media file 放到 S3 或 MinIO，不把狀態存在 Pod 本地。這樣任一 Pod 掛掉，Kubernetes 可以自動重建，流量也可以切到其他副本。",
          "Django runtime 會使用 Gunicorn 或 Uvicorn worker。若是 WSGI 就用 Gunicorn，若是 ASGI 則用 Uvicorn worker。worker 數量會依 CPU core、I/O 型態與壓測結果調整，並設定 timeout、graceful-timeout、max-requests，避免單一 request 卡住或 memory leak 長期累積。",
          "Celery Worker 會獨立部署，不跟 Django API 放在同一個 Pod，避免長任務搶走 Web API 資源。Worker 也採多副本，並依任務類型拆 queue，例如 critical、default、email、report。核心交易中可以非同步處理的部分，例如通知、對帳、狀態同步，走高優先 queue；真正需要強一致性的付款授權或扣款流程，仍應盡量走同步交易流程，並搭配 idempotency key 與 transaction record。"
        ]
      },
      {
        "heading": "Django Deployment 範例",
        "code": {
          "lang": "yaml",
          "text": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: django-api\nspec:\n  replicas: 3\n  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxUnavailable: 0\n      maxSurge: 1\n  template:\n    spec:\n      containers:\n        - name: django-api\n          image: harbor.local/app/django-api:1.0.0\n          ports:\n            - containerPort: 8000\n          readinessProbe:\n            httpGet:\n              path: /healthz/ready\n              port: 8000\n          livenessProbe:\n            httpGet:\n              path: /healthz/live\n              port: 8000\n          lifecycle:\n            preStop:\n              exec:\n                command: [\"/bin/sh\", \"-c\", \"sleep 10\"]"
        }
      },
      {
        "heading": "Celery Worker 與 KEDA",
        "body": [
          "Celery task 必須設計成 idempotent，因為 worker crash、retry 或 broker redelivery 都可能讓同一個 task 被執行超過一次。像訂單、付款、寄信任務，都要用 order_id、payment_id、transaction_id 作為唯一業務鍵，避免重複扣款或重複寄送。",
          "擴縮容方面，Django API 可以根據 CPU、memory、request rate、latency 做 HPA。Celery Worker 則更適合根據 queue length、oldest message age、active task count 使用 HPA custom metrics 或 KEDA 自動擴縮。"
        ],
        "code": {
          "lang": "yaml",
          "text": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: celery-worker-critical\nspec:\n  replicas: 3\n  template:\n    spec:\n      terminationGracePeriodSeconds: 300\n      containers:\n        - name: celery-worker\n          image: harbor.local/app/django-api:1.0.0\n          command:\n            - celery\n            - -A\n            - config\n            - worker\n            - -Q\n            - critical\n            - --concurrency=4\n            - --prefetch-multiplier=1\n            - --max-tasks-per-child=100\n---\napiVersion: keda.sh/v1alpha1\nkind: ScaledObject\nmetadata:\n  name: celery-critical-scaler\nspec:\n  scaleTargetRef:\n    name: celery-worker-critical\n  minReplicaCount: 2\n  maxReplicaCount: 20\n  triggers:\n    - type: redis\n      metadata:\n        address: redis:6379\n        listName: critical\n        listLength: \"50\" "
        }
      },
      {
        "heading": "PostgreSQL HA",
        "body": [
          "PostgreSQL 我會設計 Primary / Standby 架構，使用 Streaming Replication。依照 RPO / RTO 要求選擇 asynchronous 或 synchronous replication。非同步複寫效能較好，但 failover 時可能遺失少量資料；同步複寫一致性較高，但會增加寫入延遲。",
          "自動 failover 可以使用 Patroni 搭配 etcd、Consul 或 Kubernetes DCS 做 leader election。當 primary 故障時，Patroni 會選出合適的 standby promoted 成新的 primary，其他 replica 重新追隨新 primary。這可以大幅降低 split-brain 風險，但仍要搭配正確 quorum、健康檢查、fencing 與網路設計。",
          "應用程式連線層會加 PgBouncer 做 connection pooling，避免 Django 開太多 DB connection 打爆 PostgreSQL。服務入口可以用 HAProxy、VIP 或 Kubernetes Service。通常會拆成 primary endpoint 與 replica endpoint：寫入走 primary，讀取可依需求走 replica。讀寫分離要由應用程式或明確的 service endpoint 控制，不會單純期待 PgBouncer 自動判斷 SQL。"
        ],
        "code": {
          "lang": "text",
          "text": "Django API\n   |\nPgBouncer\n   |\nHAProxy / VIP / Service\n   |\nPatroni Cluster\n   |-- PostgreSQL Primary\n   |-- PostgreSQL Standby 1\n   |-- PostgreSQL Standby 2\n   |\nWAL Archive -> S3 / MinIO / NFS"
        }
      },
      {
        "heading": "PostgreSQL 驗證 SQL",
        "code": {
          "lang": "sql",
          "text": "-- 在 primary 看 replication 狀態\nSELECT client_addr, state, sync_state, write_lag, flush_lag, replay_lag\nFROM pg_stat_replication;\n\n-- 在 standby 看是否正在 recovery\nSELECT pg_is_in_recovery();\n\n-- 檢查 replication lag\nSELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"
        },
        "body": [
          "備份與災難復原會使用 pgBackRest 或 WAL-G 做 base backup 與 WAL archive，支援 PITR。重點不是只有設定備份，而是要定期做 restore drill，驗證備份真的能還原，並記錄實際 RTO / RPO。"
        ]
      },
      {
        "heading": "Elasticsearch HA",
        "body": [
          "Elasticsearch HA 的重點是 master quorum、data replica、shard allocation、snapshot 與容量監控。Production 環境建議至少 3 個 dedicated master-eligible nodes，data node 和 ingest / coordinating node 依負載拆分。",
          "Index 設計上，每個重要 index 至少設定 1 個 replica shard，確保任一 data node 掛掉時仍有副本可以升級為 primary。Shard 數量要依資料量規劃，不能過多也不能過少；過多會造成 cluster state 與 file descriptor 壓力，過少則不利於平行處理與擴展。",
          "跨機房或跨 AZ 部署時，會設定 shard allocation awareness，例如 node.attr.zone，讓 primary shard 與 replica shard 不落在同一個 zone 或 rack。這樣單一節點或單一 AZ 故障時，資料仍可用。"
        ],
        "code": {
          "lang": "json",
          "text": "{\n  \"index_patterns\": [\"order-*\", \"log-*\"],\n  \"template\": {\n    \"settings\": {\n      \"number_of_shards\": 3,\n      \"number_of_replicas\": 1,\n      \"index.routing.allocation.awareness.attributes\": \"zone\"\n    }\n  }\n}"
        }
      },
      {
        "heading": "備份、容量與演練",
        "body": [
          "資料生命週期用 ILM 管理，例如 hot / warm / cold / delete。近期索引放在高效能節點，舊資料移到低成本節點，超過保留期限自動刪除。備份則使用 Snapshot Lifecycle Management，定期把 snapshot 寫到 S3、GCS、MinIO 或共享儲存。Replica 不是備份，因為誤刪 index 也會同步刪除 replica，所以 snapshot 是必要的。",
          "JVM heap 通常設定為實體記憶體約一半，但不超過約 31GB，保留足夠 OS page cache 給 Lucene 使用。監控上要特別看 cluster health、unassigned shards、pending tasks、JVM heap、GC time、search/index latency、thread pool rejection、CPU、IOPS、disk usage 與 disk watermark。若達到 flood-stage watermark，Elasticsearch 可能會把 index 設成 read-only，因此要在 high watermark 前就擴容或清理資料。",
          "最後我會把 HA 設計落到三件事：第一是故障切換，例如 Pod、Node、Primary DB、Elasticsearch node 掛掉時服務是否能持續；第二是資料安全，例如 PostgreSQL 有 PITR，Elasticsearch 有 snapshot，避免 replica 被誤認為備份；第三是演練與驗證，例如定期做 failover test、restore drill、rolling upgrade drill，確認 RTO / RPO 不是紙上數字。"
        ]
      }
    ]
  },
  {
    "id": "q4",
    "title": "Q4. 觀測性 Observability 與日誌管理",
    "subtitle": "以 Metrics、Logs、Traces 為基礎，建立 SLO、Alerting、Dashboard 與 Runbook。",
    "tags": [
      "Observability",
      "Prometheus",
      "Grafana",
      "Loki",
      "OpenTelemetry"
    ],
    "question": [
      "請說明你會如何設計一套可用於微服務與 Kubernetes 環境的觀測性與日誌管理方案。"
    ],
    "answer": [
      {
        "heading": "設計目標",
        "body": [
          "我會以 Metrics、Logs、Traces 作為 observability 的三大資料來源，再透過 SLO、Alerting、Dashboard、Runbook 轉成可行動的維運流程。目標不是只知道服務有沒有掛，而是當使用者體驗變差時，可以快速回答三個問題：影響範圍多大、瓶頸在哪一層、要採取什麼止血動作。"
        ]
      },
      {
        "heading": "Metrics 與 SLO",
        "body": [
          "第一層是 Metrics。我會用 Prometheus 收集 Kubernetes、Ingress、Django API、Celery、DB、Redis、Elasticsearch 的指標，再用 Grafana 建 dashboard。應用層會看 RED 指標，也就是 request rate、error rate、duration，特別是 latency 和 HTTP 5xx。基礎設施層會看 USE 指標，也就是 CPU、memory、disk、network 的 utilization、saturation、errors。Kubernetes 會監控 Pod restart、OOMKilled、CrashLoopBackOff、Pending Pod、Node pressure、HPA desired/current replicas、Ingress 504。",
          "我會先定義核心服務的 SLI / SLO，例如 checkout API availability、successful request ratio、latency、checkout success rate。告警不會只因為 CPU 短暫超過 80% 就叫人，而是會以使用者影響和 error budget burn rate 為核心。"
        ]
      },
      {
        "heading": "PrometheusRule 範例",
        "code": {
          "lang": "yaml",
          "text": "apiVersion: monitoring.coreos.com/v1\nkind: PrometheusRule\nmetadata:\n  name: django-api-alerts\n  namespace: monitoring\nspec:\n  groups:\n    - name: django-api.rules\n      rules:\n        - alert: HighHttp5xxRate\n          expr: |\n            sum(rate(http_requests_total{service=\"django-api\",status=~\"5..\"}[5m]))\n            /\n            sum(rate(http_requests_total{service=\"django-api\"}[5m]))\n            > 0.05\n          for: 10m\n          labels:\n            severity: critical\n            service: django-api\n          annotations:\n            summary: \"Django API 5xx rate is above 5%\"\n            description: \"5xx error rate has been above 5% for 10 minutes.\"\n            runbook_url: \"https://runbook.example.com/django-api-5xx\" "
        }
      },
      {
        "heading": "Logs 與日誌治理",
        "body": [
          "第二層是 Logs。我會用 Fluent Bit 或 Vector 收集 container stdout / stderr，再送到 Loki、Elasticsearch 或 OpenSearch。應用程式日誌必須是 JSON structured logging，至少包含 timestamp、level、service、environment、request_id、trace_id、error message、exception stack，以及必要的業務識別碼，例如 order_id。但不會記錄 password、token、credit card 或個資，必要時使用 hash 或 masking。",
          "日誌治理上，我會設定 retention policy、log sampling 與 lifecycle policy，避免 log volume 打爆儲存。Production 預設 INFO 以上，DEBUG 只在短時間 troubleshooting 開啟，而且要有自動關閉機制。"
        ],
        "code": {
          "lang": "json",
          "text": "{\n  \"timestamp\": \"2026-05-23T10:00:00+08:00\",\n  \"level\": \"ERROR\",\n  \"service\": \"checkout-api\",\n  \"environment\": \"prod\",\n  \"request_id\": \"req-001\",\n  \"trace_id\": \"abc123\",\n  \"order_id\": \"ord_12345\",\n  \"error\": \"payment gateway timeout\"\n}"
        }
      },
      {
        "heading": "LogQL 查詢範例",
        "code": {
          "lang": "logql",
          "text": "{namespace=\"prod\", service=\"django-api\"}\n| json\n| level=\"ERROR\"\n| trace_id=\"abc123\"\n\n{namespace=\"ingress-nginx\"}\n|~ \"504|upstream timed out\" "
        }
      },
      {
        "heading": "Tracing 與 OpenTelemetry",
        "body": [
          "第三層是 Tracing。我會用 OpenTelemetry 標準化 instrumentation，後端接 Jaeger 或 Grafana Tempo。Trace context 要從 Ingress 傳到 Django，再傳到 Celery、DB、Redis 與第三方 API。尤其 Celery 這種 async task，要把 trace context 放進 message header，否則 HTTP request 和背景任務會斷鏈。這樣遇到 504 或 latency 暴增時，可以直接看到時間花在 API、DB query、Redis、queue waiting，還是第三方 API。",
          "架構上會讓應用程式先送到 OpenTelemetry Collector，再由 Collector 統一 export。這樣可以在 Collector 層做 batching、retry、sampling、attribute enrichment 與後端切換，不需要每個 service 都直接依賴 observability storage。"
        ],
        "code": {
          "lang": "text",
          "text": "Django / Celery / Ingress / Exporters\n        |\n        v\nOpenTelemetry Collector\n        |\n        |-- metrics -> Prometheus / Mimir\n        |-- traces  -> Tempo / Jaeger\n        |-- logs    -> Loki / OpenSearch"
        }
      },
      {
        "heading": "Alerting、Dashboard 與 Runbook",
        "body": [
          "第四層是 Alerting。我會用 Prometheus Alertmanager 串 Slack、Teams、Email 或 PagerDuty / Opsgenie。Critical alert 會針對使用者體驗，例如 5xx error rate 超過門檻、latency 持續過高、核心 API availability 低於 SLO、Celery queue oldest message age 持續上升、DB connection pool 滿、Elasticsearch cluster red。Warning 則發到團隊頻道，例如 disk usage 75%、HPA 擴容、Pod restart 增加。",
          "每個 critical alert 都要附上 dashboard link、log query、trace query、owner、impact、runbook 和 mitigation 步驟。Critical alert 必須是需要人立即處理的使用者影響事件；沒有 action 的 alert 不應該進入 on-call，避免 alert fatigue。",
          "Dashboard 設計上，我會分成幾個層級：Executive dashboard 看 SLO、availability、error budget；Service dashboard 看 API latency、RPS、5xx、dependency latency；Kubernetes dashboard 看 Pod、Node、HPA、Ingress；Data dashboard 看 DB、Redis、Elasticsearch；Celery dashboard 看 queue length、oldest task age、success / failure / retry count。"
        ]
      },
      {
        "heading": "504 排查流程示例",
        "body": [
          "以線上 504 為例，我會先看 Grafana 的 API p99 latency 和 5xx rate，確認是全站還是特定 endpoint；接著用 Loki 查同時間的 ERROR log，透過 trace_id 跳到 Tempo / Jaeger，看請求卡在 Django、DB、Redis、Celery queue 還是第三方服務。若發現是 DB slow query 或 connection pool 滿，就走 DB mitigation；若是 Celery queue 堆積，就擴 worker 或暫停低優先任務；若是第三方 API timeout，就啟用 circuit breaker 或 fallback。",
          "最後，observability 不是只把工具裝起來，而是要讓團隊能縮短 MTTD 和 MTTR。因此我會搭配 on-call 流程、runbook、postmortem、告警回顧與定期演練，持續調整 SLO、告警門檻和 dashboard，避免監控系統變成只會產生噪音的工具。"
        ]
      }
    ]
  },
  {
    "id": "q5",
    "title": "Q5. IaC 與 Kubernetes 實踐哲學",
    "subtitle": "工具分層治理、GitOps 協作、公有雲託管 K8s 與 On-Prem 自建 K8s 的取捨。",
    "tags": [
      "IaC",
      "Terraform",
      "Ansible",
      "GitOps",
      "Kubernetes"
    ],
    "question": [
      "在管理一套完整的雲端服務環境時，包含網路、K8s 叢集、資料庫等，您會如何使用工具部署？請說明它們各自最適合的場景。",
      "請比較 AWS EKS、GCP GKE、Azure AKS 與 On-Prem 自建 K8s 的主要差異，並說明什麼情境會建議團隊選擇自建 K8s。"
    ],
    "answer": [
      {
        "heading": "工具分層治理",
        "body": [
          "我會用「分層治理」的方式管理雲端與 Kubernetes 環境，不會把所有事情都塞進同一套工具。不同工具負責不同生命週期，權責清楚，才容易審查、回滾與維運。",
          "Infrastructure 層我會用 Terraform 或 OpenTofu，負責 VPC、Subnet、Security Group、IAM、EKS / GKE / AKS、RDS、Load Balancer、DNS 這類雲端基礎資源。這些資源生命週期長、變更頻率低，適合透過 PR review、remote state、state locking 管理。",
          "OS Config / Bootstrap 層我會用 Ansible。Terraform 可以建立 VM，但不適合做細緻主機設定；Ansible 比較適合初始化 OS、安裝套件、設定 NTP、sysctl、firewall、containerd、RKE2、憑證、mount disk，以及在 air-gap 環境中匯入離線套件與 image。",
          "Kubernetes App Deploy 層我會用 Helm 或 Kustomize。Helm 適合管理需要參數化與版本化的服務，例如 ingress-nginx、Prometheus、Grafana、Elasticsearch、Django API。Kustomize 適合用 base + overlay 管理 dev、staging、prod 的差異，例如 replica 數、image tag、resource limit、domain name。"
        ]
      },
      {
        "heading": "Terraform 範例",
        "code": {
          "lang": "hcl",
          "text": "module \"vpc\" {\n  source = \"./modules/vpc\"\n\n  name = \"prod-vpc\"\n  cidr = \"10.10.0.0/16\"\n}\n\nmodule \"eks\" {\n  source = \"./modules/eks\"\n\n  cluster_name = \"prod-eks\"\n  vpc_id       = module.vpc.vpc_id\n  subnet_ids   = module.vpc.private_subnet_ids\n}\n\nmodule \"rds\" {\n  source = \"./modules/rds-postgres\"\n\n  name             = \"prod-postgres\"\n  vpc_id           = module.vpc.vpc_id\n  subnet_ids       = module.vpc.private_subnet_ids\n  multi_az         = true\n  backup_retention = 7\n}"
        }
      },
      {
        "heading": "GitOps 與 CI/CD 協作",
        "body": [
          "GitOps 層我會用 Argo CD 或 Flux。CI/CD 不直接對 production cluster 做 kubectl apply，而是更新 GitOps repo 裡的 Helm values 或 Kustomize overlay。Argo CD 監聽 Git repo，將叢集狀態同步到 Git 宣告狀態，並提供 drift detection、rollback、diff 與審計紀錄。",
          "CI/CD 層我會用 GitLab CI 或 GitHub Actions。流程包含 unit test、build image、產生 SBOM、Trivy image scan、ZAP DAST、push image 到 registry / ECR / GCR，最後更新 GitOps repo 的 image tag。真正部署由 Argo CD 接手，這樣 CI 負責產物，CD 負責狀態收斂。"
        ],
        "code": {
          "lang": "text",
          "text": "Developer push code\n   ↓\nCI：unit test / build image / SBOM / Trivy scan / push registry\n   ↓\nCI 更新 GitOps repo 的 image tag 或 Helm values\n   ↓\nArgo CD 偵測 GitOps repo 變更\n   ↓\nArgo CD sync 到 Kubernetes\n   ↓\nPrometheus / Grafana / Loki 驗證部署後狀態"
        }
      },
      {
        "heading": "Argo CD Application 範例",
        "code": {
          "lang": "yaml",
          "text": "apiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata:\n  name: django-api\n  namespace: argocd\nspec:\n  project: default\n  source:\n    repoURL: ssh://git@gitlab.internal/platform/gitops.git\n    targetRevision: main\n    path: apps/django-api/overlays/prod\n  destination:\n    server: https://kubernetes.default.svc\n    namespace: prod\n  syncPolicy:\n    automated:\n      prune: true\n      selfHeal: true"
        }
      },
      {
        "heading": "Secret 管理",
        "body": [
          "Secret 層我會避免把密鑰明文寫在 Git、Terraform state 或 Helm values 裡。部署期 secret 可以用 SOPS 或 Ansible Vault；K8s runtime secret 可以用 SealedSecrets、External Secrets Operator、Vault CSI Driver 或 HashiCorp Vault。Terraform 盡量只管理 secret store、KMS key 與 IAM policy，不直接管理 secret value，避免 state file 變成敏感資料集中地。"
        ],
        "code": {
          "lang": "text",
          "text": "Terraform Secret：\n雲端 IAM role、KMS key、secret metadata，避免直接管理 secret value。\n\nGitOps Secret：\n用 SOPS + KMS/GPG/age 加密後進 Git。\n\nKubernetes Runtime Secret：\n用 External Secrets Operator 從 Vault / Cloud Secret Manager 同步。\n\nApplication Secret：\n透過 env 或 mounted volume 注入，避免寫死在 image 或 values.yaml。"
        }
      },
      {
        "heading": "託管 K8s vs On-Prem 自建 K8s",
        "table": {
          "headers": [
            "面向",
            "託管 K8s：EKS / GKE / AKS",
            "On-Prem 自建 K8s"
          ],
          "rows": [
            [
              "成本",
              "初期較低，按量付費，但 NAT、LB、跨 AZ 流量、Log、Storage、GPU 可能變貴。",
              "硬體與機房成本前期高，但長期大量固定負載可能較可控。"
            ],
            [
              "維運複雜度",
              "Control Plane、etcd、部分升級由雲商處理。",
              "control plane、etcd、CNI、storage、OS、憑證、升級都要自己維護。"
            ],
            [
              "客製化彈性",
              "受雲商限制，control plane 參數不可完全控制。",
              "彈性高，可自訂 CNI、storage、OS hardening、air-gap、GPU、網路。"
            ],
            [
              "生態整合",
              "IAM、LB、DNS、Storage、Logging、Autoscaling 整合佳。",
              "需要自己整合 Harbor、DNS、LB、Storage、監控、備份、IAM / LDAP。"
            ],
            [
              "上線速度",
              "快，適合產品快速迭代。",
              "慢，需要平台團隊成熟度。"
            ],
            [
              "合規 / 資料主權",
              "依雲區域與雲商合規能力。",
              "適合高度合規、資料不可離場、內網隔離需求。"
            ],
            [
              "可用性",
              "雲商提供 managed control plane HA。",
              "需要自行設計多 master、etcd quorum、備份與災難復原。"
            ]
          ]
        }
      },
      {
        "heading": "什麼情境建議自建 K8s",
        "body": [
          "公有雲託管 K8s，例如 EKS、GKE、AKS，最大的優勢是降低維運負擔。Control Plane、API Server、etcd HA、部分升級流程都由雲商管理，而且能原生整合 IAM、Load Balancer、Block Storage、Object Storage、Logging、Autoscaling。對於需要快速上線、團隊人力有限、系統架構標準化的產品，我會優先建議託管 K8s。",
          "On-Prem 自建 K8s，例如使用 RKE2、kubeadm、OpenShift 或 MicroK8s，優點是控制權高，可以自訂網路、CNI、Ingress、storage、GPU、OS hardening、air-gap registry 與安規設定。缺點是維運責任全部落在團隊身上，包括 etcd 備份與還原、control plane HA、K8s upgrade、CNI debug、container runtime、node OS patch、憑證輪替、監控告警、備份、災難復原。",
          "我會在以下情境建議自建 K8s：資料不可離場、air-gap、高度合規、特殊硬體、低延遲內網、特殊 CNI / Storage 需求、與內部系統深度整合，或長期大量固定負載且團隊具備成熟的 SRE / Platform Engineering 能力。反過來說，如果團隊沒有足夠 Linux、Kubernetes、Network、Storage、Security 維運能力，我不會輕易建議自建，因為自建 K8s 不是安裝完成就結束，而是要長期承擔升級、資安修補、備份、故障排查與 24/7 維運責任。"
        ],
        "quote": "Terraform 管基礎設施，Ansible 管主機狀態，Helm / Kustomize 管應用宣告，Argo CD 管叢集收斂，CI/CD 管產物交付；平台選擇則取決於合規、成本、控制權與團隊維運成熟度。"
      }
    ]
  },
  {
    "id": "q6",
    "title": "Q6. 過往經驗：主動發現並提出優化",
    "subtitle": "以 STAR 結構回答 GCB / CIS 安規自動化改善案例。",
    "tags": [
      "STAR",
      "Automation",
      "Security Baseline",
      "Bash",
      "DevOps"
    ],
    "question": [
      "請回想您過去的經驗，分享一個由您主動發現並提出優化的案例。這個案例可以是重複性的人工任務、效率低落的部署流程，或是冗餘的雲端資源。請說明當時的狀況、您提出的解決方案，以及最終帶來的效益。"
    ],
    "answer": [
      {
        "heading": "建議主題",
        "body": [
          "我打算分享關於 GCB 安規檢查自動化作為主要案例。這個案例最符合題目中的「重複性人工任務」、「主動發現問題」、「提出優化」、「帶來效益」。",
          "這個案例可以展現你不只會部署服務，也會把主機安全基線、檢查流程、修復流程標準化，並用腳本降低人為錯誤。"
        ]
      },
      {
        "heading": "STAR 架構",
        "table": {
          "headers": [
            "STAR",
            "內容"
          ],
          "rows": [
            [
              "S：Situation",
              "人工檢查 Ubuntu 安規設定，項目多、容易漏、不同主機狀態不一致。"
            ],
            [
              "T：Task",
              "把檢查與修復流程標準化、自動化，降低人工錯誤，讓新機器能快速套用 baseline。"
            ],
            [
              "A：Action",
              "整理 GCB / CIS 項目，寫 Bash scripts，自動檢查 sysctl、auditd、journald、rsyslog、AppArmor、mount option、GRUB、kernel module blacklist，並保留備份與輸出檢查結果。"
            ],
            [
              "R：Result",
              "檢查時間縮短，設定一致性提高，稽核準備更容易，也讓後續維運可以用同一套腳本重複驗證。"
            ]
          ]
        }
      },
      {
        "heading": "說明案例",
        "body": [
          "我想分享一個我主動優化 Ubuntu 主機安規檢查與修復流程的案例。當時在做 GCB / CIS 類型的安全基線設定時，很多項目都需要人工逐項確認，例如 sysctl network hardening、auditd rules、rsyslog / journald、AppArmor、/tmp 與 /dev/shm mount option、GRUB 權限、kernel module blacklist 等。這些檢查項目多，而且分散在不同設定檔，如果靠人工處理，不只耗時，也容易因為不同人操作方式不同造成遺漏。",
          "我主動把這些重複性的檢查與修復流程整理成 Bash scripts。腳本會先檢查目前狀態，再依照 baseline 套用修正，例如寫入 /etc/sysctl.d/、調整 audit rules、確認 auditd 是否啟用、設定 journald / rsyslog、檢查 /tmp 與 /dev/shm 的 noexec、nodev、nosuid，以及設定不需要的 kernel modules blacklist。為了降低風險，腳本在修改重要設定前會先備份原始檔案，並輸出執行結果，方便後續追蹤。",
          "這個改善的效益是，原本需要人工逐項檢查的工作，可以變成標準化、自動化、可重複執行的流程。新機器可以快速套用同一套 baseline，既有機器也可以定期重跑檢查，降低人為錯誤與設定不一致的風險。對團隊來說，也讓稽核準備和主機維運更有依據，不再只是靠個人經驗處理。",
          "這個經驗也讓我更重視 DevOps 裡面的自動化與可驗證性。我的想法是，只要是重複性高、容易出錯、需要多人交接的維運任務，都應該盡量被腳本化、版本控管，並且可以重複執行。"
        ]
      }
    ]
  }
];
