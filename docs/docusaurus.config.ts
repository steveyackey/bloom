import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Bloom Docs',
  tagline: 'Multi-agent task orchestration for AI-powered development',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://docs.use-bloom.dev',
  baseUrl: '/',

  organizationName: 'steveyackey',
  projectName: 'bloom',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/steveyackey/bloom/tree/main/docs/',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/bloom-logo.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Bloom',
      logo: {
        alt: 'Bloom Logo',
        src: 'img/bloom-logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://use-bloom.dev',
          label: 'Home',
          position: 'right',
        },
        {
          href: 'https://github.com/steveyackey/bloom',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started',
            },
            {
              label: 'Commands',
              to: '/commands',
            },
            {
              label: 'Best Practices',
              to: '/best-practices',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/steveyackey/bloom',
            },
            {
              label: 'Issues',
              href: 'https://github.com/steveyackey/bloom/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Website',
              href: 'https://use-bloom.dev',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Bloom. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'yaml', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
