import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  parseAssessmentDefinition,
  parsePublicAssessmentQuestions,
  parseStudentAnswers,
} from '../src/lib/assessments/validation.ts';

const root = new URL('../', import.meta.url);
const source = async (path) => readFile(new URL(path, root), 'utf8');

const questions = [
  {
    id: 'q1',
    prompt: 'Quelle couche transporte les segments ?',
    type: 'single_choice',
    options: [{ id: 'o1', text: 'Réseau' }, { id: 'o2', text: 'Transport' }],
  },
  { id: 'q2', prompt: 'Expliquez brièvement le rôle du routage.', type: 'short_answer' },
];

const answerKey = { q1: 'o2', q2: 'Achemine les paquets entre réseaux.' };

test('assessment definitions separate public questions from expected answers', () => {
  const definition = parseAssessmentDefinition(questions, answerKey);
  assert.ok(definition);
  assert.equal(definition.questions.length, 2);
  assert.equal('answer' in definition.questions[0], false);
  assert.deepEqual(definition.answerKey, answerKey);
  assert.equal(parseAssessmentDefinition([{ ...questions[0], expected_answer: 'o2' }], { q1: 'o2' }), null);
  assert.equal(parseAssessmentDefinition([{ ...questions[0], options: [{ id: 'o1', text: 'A', answer: true }] }], { q1: 'o1' }), null);
  assert.equal(parseAssessmentDefinition(questions, { q1: 'not-an-option', q2: 'texte' }), null);
  assert.equal(parseAssessmentDefinition(questions, { q1: 'o2' }), null);
});

test('public question parser rejects malformed or answer-bearing records', () => {
  assert.deepEqual(parsePublicAssessmentQuestions(questions), questions);
  assert.equal(parsePublicAssessmentQuestions([{ ...questions[0], answer: 'o2' }]), null);
  assert.equal(parsePublicAssessmentQuestions([{ ...questions[0], options: [{ id: 'o1', text: 'A', correct: true }] }]), null);
  assert.equal(parsePublicAssessmentQuestions([]), null);
});

test('student answers must match the published questions and allowed choices', () => {
  assert.deepEqual(parseStudentAnswers(questions, { q1: 'o2', q2: 'Le routage choisit un chemin.' }), {
    q1: 'o2', q2: 'Le routage choisit un chemin.',
  });
  assert.equal(parseStudentAnswers(questions, { q1: 'wrong', q2: 'Réponse' }), null);
  assert.equal(parseStudentAnswers(questions, { q1: 'o2', q2: 'Réponse', score: '100' }), null);
  assert.equal(parseStudentAnswers(questions, { q1: 'o2', q2: '' }), null);
});

test('GET origin guard accepts browser same-origin metadata but keeps writes strict', async () => {
  const request = await source('src/lib/auth/request.ts');
  assert.match(request, /request\.method !== 'GET' && request\.method !== 'HEAD'/);
  assert.match(request, /sec-fetch-site/);
  assert.match(request, /referer/);
  assert.match(request, /fetchSite === 'same-origin'/);
});

test('migration isolates answer keys from student-readable assessment rows', async () => {
  const migration = await source('supabase/migrations/20261123000100_learning_experience_v1.sql');
  assert.match(migration, /assessment_questions_public_only/);
  assert.match(migration, /CREATE TABLE public\.assessment_answer_keys/);
  assert.match(migration, /assessment_answer_keys_staff_all/);
  assert.match(migration, /CREATE POLICY assessments_read_published_or_staff/);
  assert.match(migration, /REVOKE ALL ON public\.assessments,public\.assessment_answer_keys,public\.assessment_attempts/);
});

test('student assessment route submits only own answers and does not read answer keys', async () => {
  const route = await source('app/api/student/assessments/attempts/route.ts');
  assert.match(route, /profile\.role !== 'STUDENT'/);
  assert.match(route, /parsePublicAssessmentQuestions/);
  assert.match(route, /user_id: profile\.id/);
  assert.doesNotMatch(route, /from\(['"]assessment_answer_keys['"]\)/);
  assert.doesNotMatch(route, /insert\(\{[\s\S]*?score:/);
  assert.doesNotMatch(route, /insert\(\{[\s\S]*?feedback:/);
});

test('staff grading changes only manual score and feedback', async () => {
  const route = await source('app/api/admin/assessments/[assessmentId]/attempts/route.ts');
  assert.match(route, /profile\.role/);
  assert.match(route, /score: Math\.round\(body\.score \* 100\) \/ 100/);
  assert.match(route, /feedback: body\.feedback\.trim\(\)/);
  assert.doesNotMatch(route, /correct_answer|expected_answer|answerKey/);
});

test('catalog and management interfaces reach course, lesson and assessment workflows', async () => {
  const catalog = await source('app/courses/page.tsx');
  const lessons = await source('src/components/dashboard/LessonManager.tsx');
  const assessmentManager = await source('src/components/dashboard/AssessmentManager.tsx');
  assert.match(catalog, /href=\{`\/courses\/\$\{course\.slug\}`\}/);
  assert.match(lessons, /'POST'/);
  assert.match(lessons, /'PATCH'/);
  assert.match(lessons, /'DELETE'/);
  assert.match(lessons, /sort_order/);
  assert.match(assessmentManager, /Correction enregistrée manuellement/);
  assert.match(assessmentManager, /answer_key: answerKey/);
});
