import type { Config } from 'tailwindcss';
import tokens from '@handle/design-tokens/tokens.json';

const fontFamily = (value: string) => value.split(',').map((part) => part.trim());

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          canvas: tokens.color.bg.canvas.value,
          surface: tokens.color.bg.surface.value,
          subtle: tokens.color.bg.subtle.value,
          muted: tokens.color.bg.muted.value,
          inverse: tokens.color.bg.inverse.value,
        },
        border: {
          subtle: tokens.color.border.subtle.value,
          DEFAULT: tokens.color.border.default.value,
          default: tokens.color.border.default.value,
          strong: tokens.color.border.strong.value,
          focus: tokens.color.border.focus.value,
        },
        text: {
          primary: tokens.color.text.primary.value,
          secondary: tokens.color.text.secondary.value,
          tertiary: tokens.color.text.tertiary.value,
          muted: tokens.color.text.muted.value,
          onAccent: tokens.color.text.onAccent.value,
          link: tokens.color.text.link.value,
        },
        accent: {
          DEFAULT: tokens.color.accent.default.value,
          default: tokens.color.accent.default.value,
          hover: tokens.color.accent.hover.value,
          active: tokens.color.accent.active.value,
          soft: tokens.color.accent.soft.value,
        },
        status: {
          running: tokens.color.status.running.value,
          waiting: tokens.color.status.waiting.value,
          success: tokens.color.status.success.value,
          error: tokens.color.status.error.value,
          paused: tokens.color.status.paused.value,
        },
        agent: {
          thinking: tokens.color.agent.thinking.value,
          tool: tokens.color.agent.tool.value,
          browser: tokens.color.agent.browser.value,
          terminal: tokens.color.agent.terminal.value,
          memory: tokens.color.agent.memory.value,
        },
      },
      fontFamily: {
        sans: fontFamily(tokens.typography.fontFamily.sans.value),
        display: fontFamily(tokens.typography.fontFamily.display.value),
        mono: fontFamily(tokens.typography.fontFamily.mono.value),
      },
      fontSize: {
        xs: tokens.typography.fontSize.xs.value,
        sm: tokens.typography.fontSize.sm.value,
        base: tokens.typography.fontSize.base.value,
        md: tokens.typography.fontSize.md.value,
        lg: tokens.typography.fontSize.lg.value,
        xl: tokens.typography.fontSize.xl.value,
        '2xl': tokens.typography.fontSize['2xl'].value,
        '3xl': tokens.typography.fontSize['3xl'].value,
        '4xl': tokens.typography.fontSize['4xl'].value,
      },
      spacing: {
        0: tokens.space['0'].value,
        1: tokens.space['1'].value,
        2: tokens.space['2'].value,
        3: tokens.space['3'].value,
        4: tokens.space['4'].value,
        5: tokens.space['5'].value,
        6: tokens.space['6'].value,
        8: tokens.space['8'].value,
        10: tokens.space['10'].value,
        12: tokens.space['12'].value,
        16: tokens.space['16'].value,
      },
      borderRadius: {
        xs: tokens.radius.xs.value,
        sm: tokens.radius.sm.value,
        md: tokens.radius.md.value,
        lg: tokens.radius.lg.value,
        xl: tokens.radius.xl.value,
        '2xl': tokens.radius['2xl'].value,
        '3xl': tokens.radius['3xl'].value,
        pill: tokens.radius.pill.value,
      },
      boxShadow: {
        xs: tokens.shadow.xs.value,
        sm: tokens.shadow.sm.value,
        md: tokens.shadow.md.value,
        lg: tokens.shadow.lg.value,
        modal: tokens.shadow.modal.value,
      },
      transitionDuration: {
        fast: tokens.motion.fast.value,
        base: tokens.motion.base.value,
        slow: tokens.motion.slow.value,
      },
      transitionTimingFunction: {
        'handle-ease': tokens.motion.ease.value,
      },
    },
  },
  plugins: [],
};

export default config;
