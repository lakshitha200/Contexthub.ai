import { ConfigService } from '@nestjs/config';
import { MessageRole } from '../../generated/prisma/client';
import type { LlmService } from './llm.service';
import { QueryRewriterService } from './query-rewriter.service';

const HISTORY = [
  {
    role: MessageRole.USER,
    content: 'What did the Q3 report say about revenue?',
  },
  { role: MessageRole.ASSISTANT, content: 'Revenue grew 12% to 4.2M [1].' },
];

/** The prompt text the rewriter sent, typed so it can be read through the mock. */
function promptSentTo(generate: jest.Mock): string {
  const calls = generate.mock.calls as Array<[Array<{ text: string }>]>;
  return calls[0][0][0].text;
}

function makeService(
  generate: jest.Mock,
  overrides: Record<string, string> = {},
) {
  const llm = { generate } as unknown as LlmService;
  const config = {
    get: (key: string, fallback?: string) => overrides[key] ?? fallback,
  } as unknown as ConfigService;
  return new QueryRewriterService(llm, config);
}

describe('QueryRewriterService', () => {
  it('rewrites a follow-up using the conversation', async () => {
    const generate = jest
      .fn()
      .mockResolvedValue('What did the Q3 report say about costs?');
    const service = makeService(generate);

    const result = await service.rewrite('What about costs?', HISTORY);

    expect(result).toBe('What did the Q3 report say about costs?');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('sends the mechanical-task settings, not the answering ones', async () => {
    const generate = jest.fn().mockResolvedValue('anything');
    const service = makeService(generate);

    await service.rewrite('What about costs?', HISTORY);

    expect(generate).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      { temperature: 0, maxOutputTokens: 128 },
    );
  });

  it('skips the call entirely on the first question of a conversation', async () => {
    const generate = jest.fn();
    const service = makeService(generate);

    const result = await service.rewrite('What about costs?', []);

    expect(result).toBe('What about costs?');
    expect(generate).not.toHaveBeenCalled();
  });

  it('skips the call when disabled', async () => {
    const generate = jest.fn();
    const service = makeService(generate, { QUERY_REWRITE_ENABLED: 'false' });

    const result = await service.rewrite('What about costs?', HISTORY);

    expect(result).toBe('What about costs?');
    expect(generate).not.toHaveBeenCalled();
  });

  it('falls back to the original question when the model call throws', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('quota exceeded'));
    const service = makeService(generate);

    const result = await service.rewrite('What about costs?', HISTORY);

    expect(result).toBe('What about costs?');
  });

  it('only sends the configured number of recent messages', async () => {
    const generate = jest.fn().mockResolvedValue('rewritten');
    const service = makeService(generate, {
      QUERY_REWRITE_HISTORY_MESSAGES: '2',
    });
    const long = [
      { role: MessageRole.USER, content: 'oldest question' },
      { role: MessageRole.ASSISTANT, content: 'oldest answer' },
      { role: MessageRole.USER, content: 'recent question' },
      { role: MessageRole.ASSISTANT, content: 'recent answer' },
    ];

    await service.rewrite('and then?', long);

    const prompt = promptSentTo(generate);
    expect(prompt).toContain('recent question');
    expect(prompt).not.toContain('oldest question');
  });

  it('truncates long history entries so an answer cannot dominate the prompt', async () => {
    const generate = jest.fn().mockResolvedValue('rewritten');
    const service = makeService(generate);

    await service.rewrite('and then?', [
      { role: MessageRole.ASSISTANT, content: 'x'.repeat(1000) },
    ]);

    const prompt = promptSentTo(generate);
    expect(prompt).toContain('…');
    expect(prompt).not.toContain('x'.repeat(400));
  });

  describe('sanitizing the model output', () => {
    const cases: Array<[string, string, string]> = [
      ['strips surrounding double quotes', '"Q3 costs"', 'Q3 costs'],
      ['strips surrounding single quotes', "'Q3 costs'", 'Q3 costs'],
      ['strips a code fence', '```\nQ3 costs\n```', 'Q3 costs'],
      ['strips a restated label', 'Rewritten query: Q3 costs', 'Q3 costs'],
      [
        'keeps only the first line',
        'Q3 costs\n\nI kept the topic.',
        'Q3 costs',
      ],
    ];

    it.each(cases)('%s', async (_name, modelOutput, expected) => {
      const generate = jest.fn().mockResolvedValue(modelOutput);
      const service = makeService(generate);

      await expect(service.rewrite('costs?', HISTORY)).resolves.toBe(expected);
    });

    it('falls back to the original when the output is empty', async () => {
      const generate = jest.fn().mockResolvedValue('   ');
      const service = makeService(generate);

      await expect(service.rewrite('costs?', HISTORY)).resolves.toBe('costs?');
    });

    it('falls back to the original when the model rambles', async () => {
      const generate = jest.fn().mockResolvedValue('word '.repeat(200));
      const service = makeService(generate);

      await expect(service.rewrite('costs?', HISTORY)).resolves.toBe('costs?');
    });
  });
});
