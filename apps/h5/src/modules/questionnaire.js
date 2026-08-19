/* Interface outline: implementation bodies removed. */
import { S } from '../state.js';

function currentAnswers();
function firstUnansweredIndex(questions, answers);
async function renderQuestionnaireCards();
function applyCardCompletion(mode, completed);
function dismissQuestionnaireCards();
async function startQuestionnaire(mode = 'romantic');
async function loadQuestionnaire(mode = 'romantic');
function retakeQuestionnaire(mode);
function renderQuestion();
function openQNav();
function jumpToQuestion(i);
function answerSingle(qId, val);
function answerMultiple(qId, val);
function answerScale(qId, val);
function answerText(qId, val);
function flushCurrentTextAnswer();
function nextQuestion();
function prevQuestion();
function isBlankAnswer(v);
async function submitAnswers();
