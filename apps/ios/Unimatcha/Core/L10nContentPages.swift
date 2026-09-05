import Foundation

// MARK: - Content pages (Help Center / Safety Tips / Terms of Service / Privacy Policy)
//
// Verbatim copy of apps/h5/src/modules/settings.js `CONTENT_PAGES` (en) and
// `CONTENT_PAGES_ZH` (zh). Language selection is whole-page: the zh table is a complete
// parallel document, not a per-sentence dictionary. `help`/`safety` = intro + 8 FAQ items;
// `terms`/`privacy` = "Last updated" line + 10 numbered sections. Support address is
// contact@unimatcha.ai throughout. Rendering (H5 `#content-overlay`): intro 14 px
// secondary; FAQ item = 14 px bold question + 14 px secondary answer with a hairline below;
// section = 12 px 800 +0.2em heading + 14 px secondary body; last-updated 10 px outline
// +0.2em. The page must work logged-out (it reads no session state).

enum ContentItem: Equatable {
    case faq(q: String, a: String)
    case section(h: String, body: String)
}

struct ContentPage: Equatable {
    let title: String
    let intro: String?
    let lastUpdated: String?
    let items: [ContentItem]
}

enum ContentPages {
    /// Whole-page selection: `(zh && CONTENT_PAGES_ZH[key]) || CONTENT_PAGES[key]`.
    static func page(_ key: ContentPageKey, lang: Lang) -> ContentPage {
        switch lang {
        case .zh: return zh(key)
        case .en: return en(key)
        }
    }

    /// Convenience: current language.
    static func page(_ key: ContentPageKey) -> ContentPage {
        page(key, lang: L10n.lang)
    }

    /// Settings row label for a page (dictionary keys `Help Center` … `Privacy Policy`).
    static func rowTitle(_ key: ContentPageKey) -> String {
        switch key {
        case .help: return L10n.t("Help Center")
        case .safety: return L10n.t("Safety Tips")
        case .terms: return L10n.t("Terms of Service")
        case .privacy: return L10n.t("Privacy Policy")
        }
    }

    // MARK: English (`CONTENT_PAGES`)

    static func en(_ key: ContentPageKey) -> ContentPage {
        switch key {
        case .help:
            return ContentPage(
                title: "Help Center",
                intro: "Answers to the questions we hear most often. Still stuck? Reach us via Contact Us or Report a Problem in Settings.",
                lastUpdated: nil,
                items: [
                    .faq(q: "How does weekly matching work?",
                         a: "Once you join the matching pool, our system pairs you with one carefully selected student per matching round based on your questionnaire answers, profile and preferences. Quality over quantity — you receive one proposal at a time, not an endless swipe deck."),
                    .faq(q: "Why have I not received a match yet?",
                         a: "Matches are released on a schedule, and a round may pass without a suitable candidate if the pool in your area is small or your filters are strict. Try widening your age range or disabling the same-school / same-city filters, and make sure your profile and questionnaire are complete."),
                    .faq(q: "How do I confirm or decline a match proposal?",
                         a: "When a proposal arrives, open the Match tab to view your candidate’s profile. You have 48 hours to confirm or pass. If you pass or the timer expires, you return to the pool for the next round."),
                    .faq(q: "What happens when both of us confirm?",
                         a: "You enter relationship mode: a private chat opens and you unlock the couple square to share moments together."),
                    .faq(q: "How do I edit my profile or matching preferences?",
                         a: "Go to Profile → Edit Profile to update your photos, bio and interests. Matching preferences (gender, age range, school filters) live behind the filter icon on the Match tab."),
                    .faq(q: "How do I end a connection?",
                         a: "Open your partner’s profile from the Match tab and choose Unmatch. This is permanent: the chat closes and both of you return to the matching pool."),
                    .faq(q: "How do I verify my student status?",
                         a: "Register with your university email address. Additional campus verification options are rolling out — verified profiles get a badge and priority in matching."),
                    .faq(q: "How do I delete my account?",
                         a: "Contact us at contact@unimatcha.ai from your registered email and we will remove your account and data in line with our Privacy Policy."),
                ]
            )
        case .safety:
            return ContentPage(
                title: "Safety Tips",
                intro: "Your safety matters more than any match. Keep these guidelines in mind when connecting with someone new.",
                lastUpdated: nil,
                items: [
                    .faq(q: "Keep conversations in the app",
                         a: "Chat within Unimatcha until you trust the other person. Moving to other platforms too early makes it harder for us to help if something goes wrong."),
                    .faq(q: "Take your time before meeting",
                         a: "There is no rush. Video call or chat for a while first, and be wary of anyone pressuring you to meet immediately."),
                    .faq(q: "Meet in public places",
                         a: "For first dates, choose busy campus spots, cafes or public venues during the day. Avoid private residences until you know each other well."),
                    .faq(q: "Tell a friend your plans",
                         a: "Share who you are meeting, where and when with a friend or flatmate, and check in with them during the date."),
                    .faq(q: "Arrange your own transport",
                         a: "Get to and from the date independently so you can leave whenever you want."),
                    .faq(q: "Never send money or financial details",
                         a: "No genuine match will ask you for money, gift cards, bank details or cryptocurrency. Treat any such request as a scam and report it immediately."),
                    .faq(q: "Trust your instincts",
                         a: "If something feels off — inconsistent stories, refusal to video call, guilt-tripping — it probably is. You never owe anyone a meeting or a reply."),
                    .faq(q: "Report and block",
                         a: "Use Report a Problem in Settings to flag suspicious or abusive behaviour. Reports are confidential and reviewed by our team."),
                ]
            )
        case .terms:
            return ContentPage(
                title: "Terms of Service",
                intro: nil,
                lastUpdated: "Last updated: June 2026",
                items: [
                    .section(h: "1. Acceptance of Terms",
                             body: "By creating an account or using Unimatcha (the \"Service\"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. We may update these Terms from time to time; continued use after changes take effect constitutes acceptance of the revised Terms."),
                    .section(h: "2. Eligibility",
                             body: "The Service is intended for currently enrolled university students aged 18 or over. You must register with a valid university email address and provide truthful information about yourself. You may maintain only one account, and you may not use the Service if you have previously been removed for violating these Terms."),
                    .section(h: "3. Your Account",
                             body: "You are responsible for safeguarding your login credentials and for all activity under your account. Notify us immediately at contact@unimatcha.ai if you suspect unauthorised access. We are not liable for losses arising from your failure to protect your account."),
                    .section(h: "4. Acceptable Use",
                             body: "You agree not to: impersonate any person or misrepresent your identity, age or student status; harass, threaten, defame or abuse other users; post content that is unlawful, hateful, sexually explicit or infringes the rights of others; solicit money or commercial services from other users; use bots, scrapers or other automated means to access the Service; or attempt to interfere with the proper functioning of the Service."),
                    .section(h: "5. User Content",
                             body: "You retain ownership of the photos, posts and messages you submit, but you grant Unimatcha a non-exclusive, worldwide, royalty-free licence to host, display and distribute that content within the Service for the purpose of operating its features. You represent that you have all rights necessary to share the content you upload, and that it does not violate any law or third-party right."),
                    .section(h: "6. Matching",
                             body: "Match proposals are generated algorithmically based on your questionnaire answers, profile and preferences. We do not guarantee any particular number, frequency or quality of matches, nor any outcome from a match. Decisions to confirm, decline or unmatch are entirely yours."),
                    .section(h: "7. Safety",
                             body: "We do not conduct criminal background checks on users. You are solely responsible for your interactions with other users, both online and offline. Always exercise caution and review our Safety Tips before meeting anyone in person."),
                    .section(h: "8. Termination",
                             body: "We may suspend or terminate your account at our discretion if we reasonably believe you have violated these Terms, applicable law or the spirit of the community. You may stop using the Service and request account deletion at any time."),
                    .section(h: "9. Disclaimers and Liability",
                             body: "The Service is provided \"as is\" without warranties of any kind, express or implied. To the maximum extent permitted by law, Unimatcha shall not be liable for any indirect, incidental or consequential damages arising from your use of the Service, including interactions with other users."),
                    .section(h: "10. Contact",
                             body: "Questions about these Terms? Email us at contact@unimatcha.ai."),
                ]
            )
        case .privacy:
            return ContentPage(
                title: "Privacy Policy",
                intro: nil,
                lastUpdated: "Last updated: June 2026",
                items: [
                    .section(h: "1. Introduction",
                             body: "This Privacy Policy explains how Unimatcha (\"we\", \"us\") collects, uses and protects your personal information when you use our matching service. We are committed to handling your data responsibly and transparently."),
                    .section(h: "2. Information We Collect",
                             body: "Account information: your university email address and password (stored as a salted hash). Profile information: nickname, age, gender, school, degree stage, photos, bio, interests and other details you choose to add. Questionnaire answers: your responses used to compute match compatibility. Usage data: messages you send within the app, posts and comments in the square, likes, and basic interaction logs. Technical data: device type, IP address and approximate region, used for security and service operation."),
                    .section(h: "3. How We Use Your Information",
                             body: "We use your data to: operate the matching algorithm and propose compatible partners; display your profile to your match candidates and, where you allow it, to other users; deliver chat, square and notification features; respond to your support requests and reports; keep the Service safe by detecting fraud, spam and abusive behaviour; and improve the Service through aggregated, de-identified analytics."),
                    .section(h: "4. What Other Users See",
                             body: "Your profile (photos, nickname, school, interests) is visible to users you are matched with, and to other users where features such as the square apply. You can control visibility through the privacy toggles in Settings: Show my profile, Show online status and Show my moments. Your email address and questionnaire answers are never shown to other users."),
                    .section(h: "5. Sharing",
                             body: "We do not sell your personal data. We share data only with service providers who process it on our behalf (such as hosting and image storage) under confidentiality obligations, or when required by law, or to protect the rights and safety of our users."),
                    .section(h: "6. Data Retention",
                             body: "We keep your data while your account is active. If you delete your account, we remove or anonymise your personal data within 30 days, except where we must retain limited records to comply with legal obligations or resolve disputes."),
                    .section(h: "7. Security",
                             body: "We protect your data with encryption in transit, hashed passwords, access controls and regular reviews. No system is perfectly secure, so please use a strong, unique password and report any suspected breach to us immediately."),
                    .section(h: "8. Your Rights",
                             body: "Depending on your jurisdiction, you may have the right to access, correct, export or delete your personal data, and to object to or restrict certain processing. To exercise these rights, contact us from your registered email address."),
                    .section(h: "9. Changes to This Policy",
                             body: "We may update this Policy as the Service evolves. Material changes will be announced in the app before they take effect."),
                    .section(h: "10. Contact",
                             body: "For privacy questions or requests, email contact@unimatcha.ai."),
                ]
            )
        }
    }

    // MARK: Chinese (`CONTENT_PAGES_ZH`)

    static func zh(_ key: ContentPageKey) -> ContentPage {
        switch key {
        case .help:
            return ContentPage(
                title: "帮助中心",
                intro: "这里汇总了最常见的问题。仍有疑问？可在设置中通过「联系我们」或「问题反馈」找到我们。",
                lastUpdated: nil,
                items: [
                    .faq(q: "每周匹配是怎么运作的？",
                         a: "加入匹配池后，系统会根据你的问卷答案、资料与偏好，每轮为你精心匹配一位同学。重质不重量——一次只推一位，不做无限滑动。"),
                    .faq(q: "为什么我还没有收到匹配？",
                         a: "匹配按轮次定期公布；如果你所在地区的匹配池较小或筛选条件较严，某一轮可能没有合适人选。可以尝试放宽年龄范围、关闭同校/同城筛选，并确保资料和问卷填写完整。"),
                    .faq(q: "如何确认或跳过匹配对象？",
                         a: "收到匹配后，打开匹配页查看对方资料。你有 48 小时决定确认或跳过；跳过或超时后会自动回到匹配池，等待下一轮。"),
                    .faq(q: "双方都确认后会发生什么？",
                         a: "你们将进入关系模式：开启专属聊天，并解锁情侣空间，一起记录你们的点滴。"),
                    .faq(q: "如何修改资料或匹配偏好？",
                         a: "前往「我的」→「编辑资料」更新照片、简介和兴趣。匹配偏好（性别、年龄范围、学校筛选）在匹配页的设置入口里调整。"),
                    .faq(q: "如何解除连接？",
                         a: "在匹配页打开对方资料并选择解除。此操作不可撤销：聊天将关闭，双方都会回到匹配池。"),
                    .faq(q: "如何完成学生认证？",
                         a: "使用大学邮箱注册即可。更多校园认证方式陆续开放——认证用户会获得标识，并在匹配中享有优先。"),
                    .faq(q: "如何注销账号？",
                         a: "用注册邮箱发送邮件至 contact@unimatcha.ai，我们会按照隐私政策删除你的账号与数据。"),
                ]
            )
        case .safety:
            return ContentPage(
                title: "安全提示",
                intro: "你的安全比任何匹配都重要。与新朋友建立联系时，请记住以下几点。",
                lastUpdated: nil,
                items: [
                    .faq(q: "把聊天留在应用内",
                         a: "在建立信任之前，请在 Unimatcha 内沟通。过早转移到其他平台，出现问题时我们将难以协助。"),
                    .faq(q: "别急着见面",
                         a: "不用着急。先视频或多聊一段时间；对催促你立刻见面的人保持警惕。"),
                    .faq(q: "选择公共场所见面",
                         a: "初次见面选择白天的校园人多处、咖啡馆等公共场所，熟悉之前避免前往私人住所。"),
                    .faq(q: "告诉朋友你的行程",
                         a: "把见面对象、地点和时间告诉朋友或室友，并在见面期间保持联系。"),
                    .faq(q: "自行安排交通",
                         a: "独立往返约会地点，想离开时随时可以离开。"),
                    .faq(q: "绝不转账或透露财务信息",
                         a: "真正的匹配对象不会向你要钱、礼品卡、银行卡信息或加密货币。遇到此类请求一律视为诈骗并立即举报。"),
                    .faq(q: "相信直觉",
                         a: "如果感觉不对劲——说辞前后矛盾、拒绝视频、道德绑架——那多半就是有问题。你不欠任何人一次见面或一条回复。"),
                    .faq(q: "举报与屏蔽",
                         a: "通过设置中的「问题反馈」举报可疑或骚扰行为。举报完全保密，由我们的团队审核处理。"),
                ]
            )
        case .terms:
            return ContentPage(
                title: "用户协议",
                intro: nil,
                lastUpdated: "最近更新：2026 年 6 月",
                items: [
                    .section(h: "1. 协议接受",
                             body: "创建账号或使用 Unimatcha（下称\"本服务\"）即表示你同意受本协议约束；如不同意，请勿使用本服务。我们可能不时更新协议内容，更新生效后继续使用即视为接受修订条款。"),
                    .section(h: "2. 使用资格",
                             body: "本服务面向年满 18 周岁的在校大学生。你须使用有效的大学邮箱注册，并提供真实信息。每人仅可持有一个账号；曾因违反协议被移除者不得再次使用。"),
                    .section(h: "3. 你的账号",
                             body: "你须妥善保管登录凭据，并对账号下的所有活动负责。如怀疑账号被盗用，请立即联系 contact@unimatcha.ai。因未妥善保管账号造成的损失，我们不承担责任。"),
                    .section(h: "4. 行为规范",
                             body: "你同意不：冒充他人或虚报身份、年龄、学生身份；骚扰、威胁、诽谤或辱骂其他用户；发布违法、仇恨、色情或侵权内容；向其他用户募集钱款或推销商业服务；使用机器人、爬虫等自动化手段访问本服务；或干扰本服务的正常运行。"),
                    .section(h: "5. 用户内容",
                             body: "你上传的照片、帖子与消息归你所有，但你授予 Unimatcha 一项非独占、全球性、免版税的许可，允许我们为运营产品功能而托管、展示与分发这些内容。你保证对所上传内容拥有全部必要权利，且内容不违反法律或侵犯第三方权利。"),
                    .section(h: "6. 匹配机制",
                             body: "匹配结果由算法根据你的问卷答案、资料与偏好生成。我们不保证匹配的数量、频率或质量，也不保证任何匹配结果。确认、跳过或解除均由你自行决定。"),
                    .section(h: "7. 安全",
                             body: "我们不对用户进行犯罪背景调查。你须对线上线下与其他用户的互动自行负责。见面前请务必谨慎，并阅读我们的安全提示。"),
                    .section(h: "8. 终止",
                             body: "如我们有合理理由认为你违反了本协议、适用法律或社区精神，可暂停或终止你的账号。你可以随时停止使用本服务并申请注销账号。"),
                    .section(h: "9. 免责声明与责任限制",
                             body: "本服务按\"现状\"提供，不作任何明示或默示的保证。在法律允许的最大范围内，Unimatcha 不对因使用本服务（包括与其他用户的互动）产生的间接、附带或后果性损害承担责任。"),
                    .section(h: "10. 联系我们",
                             body: "对本协议有任何疑问，请发送邮件至 contact@unimatcha.ai。"),
                ]
            )
        case .privacy:
            return ContentPage(
                title: "隐私政策",
                intro: nil,
                lastUpdated: "最近更新：2026 年 6 月",
                items: [
                    .section(h: "1. 引言",
                             body: "本隐私政策说明 Unimatcha（下称\"我们\"）在你使用匹配服务时如何收集、使用和保护你的个人信息。我们承诺以负责、透明的方式处理你的数据。"),
                    .section(h: "2. 我们收集的信息",
                             body: "账号信息：大学邮箱与密码（以加盐哈希存储）。资料信息：昵称、年龄、性别、学校、学业阶段、照片、简介、兴趣等你选择填写的内容。问卷答案：用于计算匹配契合度。使用数据：应用内消息、广场帖子与评论、点赞及基础交互日志。技术数据：设备类型、IP 地址与大致地区，用于安全与服务运行。"),
                    .section(h: "3. 信息的使用方式",
                             body: "我们使用你的数据来：运行匹配算法并推荐合适的对象；向匹配候选人（及你允许的其他用户）展示你的资料；提供聊天、广场与通知功能；响应你的支持请求与举报；通过识别欺诈、垃圾信息与滥用行为保障服务安全；以及通过聚合、去标识化的分析改进服务。"),
                    .section(h: "4. 其他用户可见的内容",
                             body: "你的资料（照片、昵称、学校、兴趣）对匹配对象可见，并在广场等场景对其他用户可见。你可以在设置的隐私开关中控制可见性：公开我的资料、显示在线状态、公开我的动态。你的邮箱和问卷答案绝不会向其他用户展示。"),
                    .section(h: "5. 数据共享",
                             body: "我们不出售你的个人数据。仅在以下情况共享：受保密义务约束、代表我们处理数据的服务商（如托管与图片存储）；法律要求；或为保护用户的权利与安全。"),
                    .section(h: "6. 数据保留",
                             body: "账号存续期间我们保留你的数据。注销账号后，我们将在 30 天内删除或匿名化你的个人数据，法律要求保留或争议处理所需的少量记录除外。"),
                    .section(h: "7. 数据安全",
                             body: "我们通过传输加密、密码哈希、访问控制与定期审查保护你的数据。没有绝对安全的系统，请使用高强度的唯一密码，并在怀疑账号异常时立即联系我们。"),
                    .section(h: "8. 你的权利",
                             body: "依据你所在司法辖区的法律，你可能有权访问、更正、导出或删除个人数据，并反对或限制某些处理。行使这些权利请用注册邮箱联系我们。"),
                    .section(h: "9. 政策更新",
                             body: "随着服务演进，我们可能更新本政策。重大变更会在生效前于应用内公告。"),
                    .section(h: "10. 联系我们",
                             body: "隐私相关问题或请求，请发送邮件至 contact@unimatcha.ai。"),
                ]
            )
        }
    }

    #if DEBUG
    static func verify() -> [String] {
        var f: [String] = []
        for lang in Lang.allCases {
            for key in [ContentPageKey.help, .safety, .terms, .privacy] {
                let p = page(key, lang: lang)
                let want = (key == .help || key == .safety) ? 8 : 10
                if p.items.count != want { f.append("content \(lang) \(key) items \(p.items.count) != \(want)") }
                let hasIntro = p.intro != nil, hasLast = p.lastUpdated != nil
                if (key == .help || key == .safety) && !(hasIntro && !hasLast) { f.append("content \(lang) \(key) intro/last shape") }
                if (key == .terms || key == .privacy) && !(hasLast && !hasIntro) { f.append("content \(lang) \(key) intro/last shape") }
            }
        }
        if page(.terms, lang: .zh).title != "用户协议" { f.append("content zh terms title") }
        if page(.privacy, lang: .en).lastUpdated != "Last updated: June 2026" { f.append("content en last updated") }
        return f
    }
    #endif
}
