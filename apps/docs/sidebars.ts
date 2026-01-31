import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/core-concepts',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/workspace-setup',
        'guides/repository-management',
        'guides/project-workflow',
        'guides/task-management',
        'guides/multi-agent-orchestration',
      ],
    },
    {
      type: 'category',
      label: 'Commands',
      collapsed: true,
      items: [
        'commands/overview',
        'commands/init',
        'commands/repo',
        'commands/create',
        'commands/plan',
        'commands/generate',
        'commands/run',
        'commands/view',
        'commands/task-management',
        'commands/questions',
      ],
    },
    {
      type: 'category',
      label: 'Agents',
      collapsed: false,
      items: [
        'agents/README',
        'agents/claude',
        'agents/copilot',
        'agents/codex',
        'agents/goose',
        'agents/opencode',
        'agents/cursor',
      ],
    },
    {
      type: 'category',
      label: 'Best Practices',
      collapsed: true,
      items: [
        'best-practices/project-structure',
        'best-practices/writing-prds',
        'best-practices/task-design',
        'best-practices/agent-collaboration',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        'reference/task-schema',
        'reference/configuration',
        'reference/tui-controls',
      ],
    },
  ],
};

export default sidebars;
