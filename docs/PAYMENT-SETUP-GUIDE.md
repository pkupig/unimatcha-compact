# 支付渠道开通指南（Stripe，一次覆盖国内外用户）

> 面向"团队只有几个学生、公司大概在英国注册"这种情况，给出**最省事**的开通路径。
> 我不是律师也不是会计，这不是法律/税务建议——涉及金额较大或有疑问的地方，建议花点钱找一个会计核实一遍，比事后返工便宜。
> 编写日期：2026-09-04，信息经网络搜索核实（来源见文末），费用/规则以你实际申请时官网为准。

---

## 一、结论：只用 Stripe 一家，不用分别申请微信/支付宝商户号

你选了"国内外用户都要覆盖"。天真的做法是"Stripe 接国际用户 + 另外申请微信支付/支付宝商户号接国内用户"——**这条路对一个英国主体的公司几乎走不通**：微信支付、支付宝的直连商户号原则上要求申请方是**中国大陆注册的企业**，绑定的也是对公账户，一个英国 Ltd 公司很难直接拿到。

好消息是**不需要走这条路**。Stripe 现在原生支持把 **Alipay（支付宝）** 和 **WeChat Pay（微信支付）** 当作一种"支付方式"接入，跟接 Visa/Mastercard 是同一个账号、同一套 API，在 Stripe 后台点一下就能开通，不需要额外找中国的收单机构，也不需要中国企业主体。核实过官方页面：

- **WeChat Pay** 明确支持商户账号地区里包含 **UK**（英国），结算币种含 **GBP/CNY/EUR/USD** 等 13 种（[stripe.com/payment-method/wechat-pay](https://stripe.com/payment-method/wechat-pay)）。
- **Alipay** 支持地区含英国在内 50+ 国家/地区，结算币种含 **GBP/CNY** 等 11 种，官网原话是"在设置里点一下就能加"（[stripe.com/payment-method/alipay](https://stripe.com/payment-method/alipay)）。

所以结论：**开一个英国主体的 Stripe 账号，在后台把 Alipay 和 WeChat Pay 作为付款方式打开**，就是覆盖国内外用户的最短路径。是否所有商户类目都能"零审核秒开"这两个支付方式，官网页面没写死，实际申请时如果需要人工审核/联系销售，属正常情况，不代表申请失败。

---

## 二、你需要按顺序做的事

### Step 0：把公司注册这件事确认落地

你说"公司大概创立在英国"——如果还没完全办完，先把这步走完，因为 Stripe 要对着 Companies House 的登记信息核验。2026 年英国这边有个新规矩要注意：

- **2026 年 2 月起，Companies House 强制要求所有董事和"重大控制人"（持股/表决权 25% 以上的人）做身份验证**（通过 GOV.UK One Login），没验证走不完注册流程。团队里谁是法定董事、谁算重大控制人，要先在内部定清楚。
- 在线注册费用 **£100**，通常 **24 小时内批下来**（同日加急 £156，邮寄纸质 £124 且要 8-10 个工作日，没必要选这个）。
- 需要准备：公司名称、英国注册地址（可以用代理注册地址服务，不一定要真实办公室）、至少一名董事、股东信息、股权结构、至少一个 SIC 行业代码。

如果这步已经办完了，跳过。

### Step 1：开一个公司对公银行账户

Stripe 打款需要一个对公账户接收结算资金。给学生团队的建议：**不用去传统大银行**（开户慢、经常要求到店、对没有经营流水的新公司不友好），直接用面向初创公司的线上银行,当天或几天内就能开：

- **Tide**——公司注册后能同步开户，上手快，官方还有"注册送 £50 + 免公司注册费"的活动（活动内容以官网当时页面为准）。
- **Wise Business** / **Revolut Business**——如果以后有比较多的跨境（英镑⇄人民币等）收付，Wise 在汇率上通常更划算。

三选一都行，团队小、流程简单优先选 Tide。

### Step 2：注册 Stripe 账号（英国主体）

1. [dashboard.stripe.com/register](https://dashboard.stripe.com/register) 注册，业务类型选"公司/Limited company"。
2. 按提示填：公司注册号（Companies House 那个编号）、注册地址（要跟 Companies House 登记的一致，不一致会卡审核）、业务类型/所属行业、网站/App 描述（可以直接写"校园社交匹配应用，通过应用内虚拟货币'能量'购买增值服务"）。
3. 上传材料验证身份和地址（董事身份证件、公司地址证明）。
4. **重大受益人（UBO）核验**——持股或表决权 25% 以上的每个人都要单独做身份验证，团队里谁占多少股权要先明确。
5. 填 Step 1 开好的对公账户信息，用于接收结算资金。

这一步走完，你就有了一个能收 Visa/Mastercard/银行卡的账号。

### Step 3：在 Stripe 后台打开 Alipay 和 WeChat Pay

登录 Stripe Dashboard → Settings → Payment methods，找到 Alipay 和 WeChat Pay，点击开通。如果界面提示需要额外资料或转人工审核（比如问你预计交易量、具体使用场景），如实填"校园应用内虚拟货币充值"即可，这是正常流程不是被拒。

### Step 4：把密钥给我，我来接代码

拿到 Stripe 账号后，Dashboard → Developers → API keys 里有：
- **Publishable key**（`pk_...`，前端用，不敏感）
- **Secret key**（`sk_...`，后端用，**敏感信息**）

**建议**：先用 Stripe 的**测试模式（Test mode）密钥**（`pk_test_.../sk_test_...`）给我，我先把整套下单→支付→回调验签→能量入账的流程接好并跑通测试用例，确认没问题后，你再切到正式密钥（`pk_live_.../sk_live_...`）上线——这样即使代码有 bug，也不会影响真实资金。

密钥这类敏感信息建议你直接写进服务器的 `.env` 文件（我可以告诉你写在哪一行、变量名叫什么），而不是贴在聊天记录里。

---

## 三、大致时间线和成本

| 步骤 | 预计耗时 | 费用 |
|---|---|---|
| 公司注册（如未完成） | 1-2 天 | £100 |
| 开对公账户（Tide/Wise/Revolut） | 当天到几天 | 大多免月费或象征性费用 |
| Stripe 账号注册+验证 | 几天到两周（取决于资料齐不齐、是否被抽审） | 免费开户，按交易抽成（英国国内卡通常 1.5%+20p，具体以官网费率页为准） |
| 开通 Alipay/WeChat Pay | 开完 Stripe 账号后随时可申请 | 费率另计，具体登录后台查看 |
| 我接代码 + 测试模式联调 | 我这边的工作量，几天内 | — |
| 切正式密钥上线 | 你确认后随时 | — |

---

## 四、几个容易踩的坑

1. **注册地址要和 Companies House 一致**——很多人图方便找了个虚拟地址服务，结果和公司注册地址对不上，验证会卡住，两边保持一致。
2. **税务发票另算**——Stripe 只负责收钱，给用户开发票/交增值税这类是另一个问题，涉及金额变大后建议找会计一起看，尤其是"能量"这种预付费虚拟货币在税务上怎么确认收入，规则不算简单。
3. **别在正式上线前跳过测试模式**——Stripe 测试模式可以完整模拟支付成功/失败/需要人工审核等各种场景，不花一分钱就能把代码路径走全，图省事直接上正式密钥测试是在拿真钱练手。
4. **Alipay/WeChat Pay 有各自的结算周期和币种规则**，不一定和银行卡走同一个节奏，正式启用前在 Stripe 文档里确认一遍到账时间，别让"用户已经买了能量、后台却看不到钱"这种时间差搞得像出了 bug。

---

## 五、你办完这些之后，找我做什么

把 Stripe 测试模式的 `Secret key` 给我（放在服务器 `.env` 里，不要贴聊天里），我会做这几件事（对应 [docs/OPERATIONS-READINESS.md](OPERATIONS-READINESS.md) 第 2.1 节提到的缺口）：

1. 把 `apps/api/src/energy/energy.service.ts` 现在的 mock 两步流程改造成真实的 Stripe Checkout/PaymentIntent 下单。
2. 加一个 webhook 端点接收 Stripe 的支付成功/失败回调，做签名验签（防伪造回调）。
3. 处理幂等——防止同一笔支付因为网络重试被重复入账。
4. 用测试卡号/测试模式的 Alipay、WeChat Pay 模拟支付全跑一遍，确认能量正确到账、失败正确回滚。
5. 全部测试模式跑通后，你再决定什么时候切正式密钥。

---

## 来源

- [Stripe：WeChat Pay 支付方式说明](https://stripe.com/payment-method/wechat-pay)
- [Stripe：Alipay 支付方式说明](https://stripe.com/payment-method/alipay)
- [Stripe 官方：中国支付方式全球支持](https://stripe.com/payments/chinese-payment-methods)
- [Tide：英国公司注册费用说明（2026）](https://www.tide.co/blog/company-formation/cost-to-register-a-company/)
- [Business Expert：2026 英国有限公司注册步骤/费用/周期](https://www.businessexpert.co.uk/business-setup/how-to-register-a-uk-company/)
- [Tide vs Revolut 企业账户对比](https://www.tide.co/business-current-account/compare-tide-vs-revolut/)
- [Stripe Support：英国受益所有人核验要求](https://support.stripe.com/questions/beneficial-ownership-requirements-united-kingdom)
