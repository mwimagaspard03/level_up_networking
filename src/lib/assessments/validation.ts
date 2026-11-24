export type AssessmentChoice = { id: string; text: string };

export type AssessmentQuestion = {
  id: string;
  prompt: string;
  type: 'single_choice' | 'short_answer';
  options?: AssessmentChoice[];
};

export type AssessmentDefinition = {
  questions: AssessmentQuestion[];
  answerKey: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value);

export function parseAssessmentDefinition(
  questionsValue: unknown,
  answerKeyValue: unknown,
): AssessmentDefinition | null {
  if (!Array.isArray(questionsValue) || questionsValue.length < 1 || questionsValue.length > 10) {
    return null;
  }
  if (!isRecord(answerKeyValue)) return null;

  const questions: AssessmentQuestion[] = [];
  const questionIds = new Set<string>();

  for (const value of questionsValue) {
    if (!isRecord(value)) return null;
    if (Object.keys(value).some((key) => !['id', 'prompt', 'type', 'options'].includes(key))) return null;
    if (!validId(value.id) || questionIds.has(value.id)) return null;
    if (typeof value.prompt !== 'string' || value.prompt.trim().length < 1 || value.prompt.length > 1000) return null;
    if (value.type !== 'single_choice' && value.type !== 'short_answer') return null;

    const question: AssessmentQuestion = {
      id: value.id,
      prompt: value.prompt.trim(),
      type: value.type,
    };

    if (value.type === 'single_choice') {
      if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 6) return null;
      const optionIds = new Set<string>();
      const options: AssessmentChoice[] = [];
      for (const option of value.options) {
        if (!isRecord(option) || Object.keys(option).some((key) => !['id', 'text'].includes(key))) return null;
        if (!validId(option.id) || optionIds.has(option.id)) return null;
        if (typeof option.text !== 'string' || option.text.trim().length < 1 || option.text.length > 200) return null;
        optionIds.add(option.id);
        options.push({ id: option.id, text: option.text.trim() });
      }
      question.options = options;
    } else if (value.options !== undefined) {
      return null;
    }

    questionIds.add(question.id);
    questions.push(question);
  }

  const keyIds = Object.keys(answerKeyValue);
  if (keyIds.length !== questionIds.size || keyIds.some((id) => !questionIds.has(id))) return null;

  const answerKey: Record<string, string> = {};
  for (const question of questions) {
    const expected = answerKeyValue[question.id];
    if (typeof expected !== 'string' || expected.trim().length < 1 || expected.length > 1000) return null;
    if (question.type === 'single_choice' && !question.options?.some((option) => option.id === expected)) return null;
    answerKey[question.id] = expected.trim();
  }

  return { questions, answerKey };
}

export function parseStudentAnswers(
  questions: AssessmentQuestion[],
  answersValue: unknown,
): Record<string, string> | null {
  if (!isRecord(answersValue) || questions.length < 1 || questions.length > 10) return null;
  const answerIds = Object.keys(answersValue);
  if (answerIds.length !== questions.length) return null;

  const answers: Record<string, string> = {};
  for (const question of questions) {
    const answer = answersValue[question.id];
    if (typeof answer !== 'string' || answer.trim().length < 1 || answer.length > 1000) return null;
    if (question.type === 'single_choice' && !question.options?.some((option) => option.id === answer)) return null;
    answers[question.id] = answer.trim();
  }
  if (answerIds.some((id) => !questions.some((question) => question.id === id))) return null;
  return answers;
}


export function parsePublicAssessmentQuestions(value: unknown): AssessmentQuestion[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;
  const placeholderKeys: Record<string, string> = {};
  for (const question of value) {
    if (!isRecord(question) || !validId(question.id)) return null;
    if (question.type === 'single_choice') {
      if (!Array.isArray(question.options) || !isRecord(question.options[0]) || !validId(question.options[0].id)) return null;
      placeholderKeys[question.id] = question.options[0].id;
    } else if (question.type === 'short_answer') {
      placeholderKeys[question.id] = 'validation-placeholder';
    } else {
      return null;
    }
  }
  return parseAssessmentDefinition(value, placeholderKeys)?.questions ?? null;
}
