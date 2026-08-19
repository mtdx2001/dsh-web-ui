import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle(
  '@linxin666/dsh-gateway-retry',
  ['src/index.ts'],
  {
    lib: {
      external: [
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-agent',
        '@deepseek-ai/dsh-llm',
        '@deepseek-ai/dsh-llm-retry',
        '@deepseek-ai/dsh-session',
      ],
    },
  },
)
