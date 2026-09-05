#if DEBUG
import Foundation

/// Decode / rule checks for the questionnaire contracts (PLAN §H.4; run by WP-16's
/// `-unimatcha-decode-check`). Fixtures: `questionnaire-romantic-v2.json` (18 q),
/// `questionnaire-friend-v2.json` (14 q) from h5-questionnaire.md Appendix A,
/// `questionnaire-completion.json`, `questionnaire-answers-mine.json`.
enum QuestionnaireFixtures {
    static func verify() throws {
        // MARK: GET /questionnaire/active — romantic v4
        let romName = "questionnaire-romantic-v2"
        let rom = try FixtureCheck.decode(QuestionnaireVersion.self, fixture: romName)
        try FixtureCheck.expect(rom.questions.count == 18, romName, "18 questions")
        try FixtureCheck.expect(rom.mode == .romantic, romName, "type ROMANTIC → .romantic")
        try FixtureCheck.expect(rom.version == 4 && rom.isActive == true, romName, "version 4 active")
        let first = rom.questions[0]
        try FixtureCheck.expect(first.code == "db_distance" && first.type == .singleChoice, romName, "q1 db_distance single")
        try FixtureCheck.expect(first.options.count == 3 && first.options[0].value == "must_same_city", romName, "q1 options")
        try FixtureCheck.expect(first.options[0].labelEn == "Must be in the same city" && first.options[0].label == "必须同城", romName, "q1 option labels")
        try FixtureCheck.expect(first.titleEn == "Your stance on distance" && first.title == "对异地 / 距离的态度", romName, "q1 titles")
        try FixtureCheck.expect(rom.questions[1].type == .scale && rom.questions[1].options.isEmpty, romName, "SCALE has no options")
        let romText = rom.questions.filter { $0.type == .text }
        try FixtureCheck.expect(romText.count == 2 && romText.allSatisfy { !$0.isRequired && $0.isOptionalText }, romName, "2 optional TEXT")
        try FixtureCheck.expect(rom.questions.filter { $0.isRequired }.count == 16, romName, "16 required")
        // Type mix (Appendix A): romantic SCALE ×9, SINGLE ×6, MULTI ×1, TEXT ×2
        try FixtureCheck.expect(rom.questions.filter { $0.type == .scale }.count == 9, romName, "9 SCALE")
        try FixtureCheck.expect(rom.questions.filter { $0.type == .singleChoice }.count == 6, romName, "6 SINGLE")
        try FixtureCheck.expect(rom.questions.last?.code == "db_other" && rom.questions.last?.hardness == "hard", romName, "tail db_other hard")
        let multi = rom.questions.first { $0.code == "asp_shared" }
        try FixtureCheck.expect(multi?.type == .multipleChoice && multi?.options.count == 9, romName, "asp_shared multi 9")

        // MARK: friend v5
        let friName = "questionnaire-friend-v2"
        let fri = try FixtureCheck.decode(QuestionnaireVersion.self, fixture: friName)
        try FixtureCheck.expect(fri.questions.count == 14, friName, "14 questions")
        try FixtureCheck.expect(fri.mode == .friend, friName, "type FRIEND → .friend")
        try FixtureCheck.expect(fri.id != rom.id, friName, "distinct version id")
        let act = fri.questions.first { $0.code == "act_types" }
        try FixtureCheck.expect(act?.type == .multipleChoice && act?.options.count == 10, friName, "act_types multi 10")
        try FixtureCheck.expect(fri.questions.filter { $0.isRequired }.count == 12, friName, "12 required")
        try FixtureCheck.expect(fri.questions[0].code == "db_distance" && fri.questions[13].code == "db_other", friName, "shared head/tail")

        // MARK: GET /questionnaire/completion
        let compName = "questionnaire-completion"
        let comp = try FixtureCheck.decode(QuestionnaireCompletion.self, fixture: compName)
        try FixtureCheck.expect(comp.isCompleted(.romantic) && comp.romantic?.versionId == rom.id, compName, "romantic completed + versionId")
        try FixtureCheck.expect(!comp.isCompleted(.friend) && comp.friend?.versionId == nil, compName, "friend incomplete, versionId absent")
        let noVersion = try JSONDecoder().decode(QuestionnaireCompletion.self, from: Data(#"{"romantic":{"completed":false}}"#.utf8))
        try FixtureCheck.expect(noVersion.friend == nil && !noVersion.isCompleted(.friend), "inline", "missing bucket → not completed")

        // MARK: GET /answers/mine → hydration
        let ansName = "questionnaire-answers-mine"
        let mine = try FixtureCheck.decode([MyAnswer].self, fixture: ansName)
        try FixtureCheck.expect(mine.count == 5, ansName, "5 rows")
        try FixtureCheck.expect(mine[0].question?.type == .text && mine[0].questionnaireVersion?.version == 4, ansName, "nested refs")
        let bucket = QuestionnaireLogic.hydrate(answers: mine, version: rom)
        try FixtureCheck.expect(bucket.count == 4, ansName, "foreign question id ignored → 4")
        let qDistance = rom.questions[0].id
        let qFamily = rom.questions[1].id
        let qShared = multi?.id ?? ""
        let qTraits = rom.questions.first { $0.code == "asp_traits" }?.id ?? ""
        try FixtureCheck.expect(bucket[qDistance] == .single("must_same_city"), ansName, "single typed")
        try FixtureCheck.expect(bucket[qFamily] == .scale(4), ansName, "scale typed Int")
        try FixtureCheck.expect(bucket[qShared] == .multi(["music", "travel"]), ansName, "multi keeps order")
        try FixtureCheck.expect(bucket[qTraits] == .text("Kind and curious"), ansName, "text typed")
        // Resume index: q1, q2 answered → first unanswered is index 2 (val_openness)
        try FixtureCheck.expect(QuestionnaireLogic.firstUnansweredIndex(questions: rom.questions, bucket: bucket) == 2, ansName, "first unanswered = 2")
        // `question_id` tolerated
        let alt = try JSONDecoder().decode(MyAnswer.self, from: Data(#"{"question_id":"qx","value":"3"}"#.utf8))
        try FixtureCheck.expect(alt.questionId == "qx" && AnswerValue.from(json: alt.value, type: .scale) == .scale(3), "inline", "question_id + numeric string → scale")
        try FixtureCheck.expect(AnswerValue.from(json: AnyCodable("a"), type: .multipleChoice) == .multi(["a"]), "inline", "string → multi wrap")
        try FixtureCheck.expect(AnswerValue.from(json: AnyCodable(nil), type: .text) == nil, "inline", "null → nil")

        // MARK: blank rule (nil / "" / [] ; TEXT trimmed)
        try FixtureCheck.expect(QuestionnaireLogic.isBlank(nil), "inline", "nil blank")
        try FixtureCheck.expect(QuestionnaireLogic.isBlank(.text("")), "inline", "empty text blank")
        try FixtureCheck.expect(QuestionnaireLogic.isBlank(.text("  \n")), "inline", "whitespace text blank")
        try FixtureCheck.expect(QuestionnaireLogic.isBlank(.multi([])), "inline", "empty multi blank")
        try FixtureCheck.expect(QuestionnaireLogic.isBlank(.single("")), "inline", "empty single blank")
        try FixtureCheck.expect(!QuestionnaireLogic.isBlank(.scale(1)), "inline", "scale answered")
        try FixtureCheck.expect(!QuestionnaireLogic.isBlank(.text("a")), "inline", "text answered")
        try FixtureCheck.expect(!QuestionnaireLogic.isBlank(.multi(["x"])), "inline", "multi answered")

        // MARK: required check + payload (blanks dropped, question order, TEXT trimmed)
        var full = bucket
        for q in rom.questions where full[q.id] == nil {
            switch q.type {
            case .scale: full[q.id] = .scale(3)
            case .singleChoice: full[q.id] = .single(q.options.first?.value ?? "")
            case .multipleChoice: full[q.id] = .multi([q.options.first?.value ?? ""])
            case .text: full[q.id] = .text("   ")
            }
        }
        try FixtureCheck.expect(QuestionnaireLogic.firstMissingRequiredIndex(questions: rom.questions, bucket: bucket) == 2, "inline", "first missing required = 2")
        try FixtureCheck.expect(QuestionnaireLogic.firstMissingRequiredIndex(questions: rom.questions, bucket: full) == nil, "inline", "no missing required")
        try FixtureCheck.expect(QuestionnaireLogic.firstUnansweredIndex(questions: rom.questions, bucket: full) == 17, "inline", "whitespace db_other is the first blank (index 17)")
        var everything = full
        everything[rom.questions[17].id] = .text("nothing")
        try FixtureCheck.expect(QuestionnaireLogic.firstUnansweredIndex(questions: rom.questions, bucket: everything) == 17, "inline", "all answered → last index (gotcha 6)")
        try FixtureCheck.expect(QuestionnaireLogic.firstUnansweredIndex(questions: [], bucket: [:]) == 0, "inline", "empty questions → 0")
        let items = QuestionnaireLogic.payload(questions: rom.questions, bucket: full)
        try FixtureCheck.expect(items.count == 17, "inline", "whitespace TEXT dropped → 17 items")
        try FixtureCheck.expect(items.first?.questionId == qDistance && items.last?.questionId == qTraits, "inline", "payload in question order")
        try FixtureCheck.expect(QuestionnaireLogic.answeredCount(questions: rom.questions, bucket: full) == 17, "inline", "answeredCount 17")
        var trimmed = bucket
        trimmed[qTraits] = .text("  spaced  ")
        let trimmedItems = QuestionnaireLogic.payload(questions: rom.questions, bucket: trimmed)
        try FixtureCheck.expect(trimmedItems.last?.value == .text("spaced"), "inline", "TEXT trimmed on the wire")

        // MARK: wire encoding — scale Int, single String, multi [String], text String
        func json<T: Encodable>(_ v: T) throws -> String {
            String(decoding: try Endpoint.encoder.encode(v), as: UTF8.self)
        }
        let scaleJSON = try json(AnswerItem(questionId: "q", value: .scale(3)))
        try FixtureCheck.expect(scaleJSON == #"{"questionId":"q","value":3}"#, "inline", "scale encodes as number got \(scaleJSON)")
        let singleJSON = try json(AnswerItem(questionId: "q", value: .single("must_same_city")))
        try FixtureCheck.expect(singleJSON == #"{"questionId":"q","value":"must_same_city"}"#, "inline", "single encodes as value string got \(singleJSON)")
        let multiJSON = try json(AnswerItem(questionId: "q", value: .multi(["b", "a"])))
        try FixtureCheck.expect(multiJSON == #"{"questionId":"q","value":["b","a"]}"#, "inline", "multi keeps selection order got \(multiJSON)")
        let textJSON = try json(AnswerItem(questionId: "q", value: .text("hi")))
        try FixtureCheck.expect(textJSON == #"{"questionId":"q","value":"hi"}"#, "inline", "text encodes as string got \(textJSON)")
        let req = try json(SubmitAnswersRequest(questionnaireVersionId: "v1", answers: [AnswerItem(questionId: "q", value: .scale(5))]))
        try FixtureCheck.expect(req == #"{"answers":[{"questionId":"q","value":5}],"questionnaireVersionId":"v1"}"#, "inline", "submit body shape got \(req)")

        // MARK: submit result + decode of loose answer values
        let res = try JSONDecoder().decode(APIEnvelope<SubmitAnswersResult>.self, from: Data(#"{"success":true,"data":{"message":"Questionnaire submitted successfully","answeredCount":17,"questionnaireVersion":4},"message":"Questionnaire submitted successfully","timestamp":"t"}"#.utf8))
        try FixtureCheck.expect(res.data?.answeredCount == 17 && res.data?.questionnaireVersion == 4, "inline", "submit result")
        let loose = try JSONDecoder().decode([AnswerValue].self, from: Data(#"[3, "a", ["x","y"]]"#.utf8))
        try FixtureCheck.expect(loose == [.scale(3), .single("a"), .multi(["x", "y"])], "inline", "loose AnswerValue decode")
        try FixtureCheck.expect(AnswerValue.single("2").normalized(for: .scale) == .scale(2), "inline", "normalize single → scale")
        try FixtureCheck.expect(AnswerValue.scale(2).normalized(for: .text) == .text("2"), "inline", "normalize scale → text")

        // MARK: copy tables
        try FixtureCheck.expect(QuestionnaireCopy.scaleLabels.count == 5, "inline", "5 scale labels")
        try FixtureCheck.expect(QuestionnaireCopy.scaleLabels.first == "Strongly Disagree" && QuestionnaireCopy.scaleLabels.last == "Strongly Agree", "inline", "scale label order 1 → 5")
        try FixtureCheck.expect(QuestionnairePageView.padded(3) == "03" && QuestionnairePageView.padded(18) == "18", "inline", "zero padding")

        // Unknown question type falls back to TEXT; missing isRequired defaults to true
        let odd = try JSONDecoder().decode(Question.self, from: Data(#"{"id":"z","type":"WEIRD","title":"t"}"#.utf8))
        try FixtureCheck.expect(odd.type == .text && odd.isRequired && odd.options.isEmpty && odd.titleEn == nil, "inline", "lenient Question defaults")
        let optNoValue = try JSONDecoder().decode(QuestionOption.self, from: Data(#"{"id":"o1","label":"L"}"#.utf8))
        try FixtureCheck.expect(optNoValue.value == "o1" && optNoValue.id == "o1", "inline", "option value falls back to id")
    }
}
#endif
