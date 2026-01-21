import React from 'react';
import clsx from 'clsx';
import { useNavbarSecondaryMenu } from '@docusaurus/theme-common/internal';

interface Props {
  header: React.ReactNode;
  primaryMenu: React.ReactNode;
  secondaryMenu: React.ReactNode;
}

export default function NavbarMobileSidebarLayout({
  header,
  primaryMenu,
  secondaryMenu,
}: Props): React.ReactElement {
  const { shown: secondaryMenuShown } = useNavbarSecondaryMenu();

  return (
    <div className="navbar-sidebar">
      {header}
      <div
        className={clsx('navbar-sidebar__items', {
          'navbar-sidebar__items--show-secondary': secondaryMenuShown,
        })}
      >
        <div className="navbar-sidebar__item navbar-sidebar__item--primary menu">
          {primaryMenu}
        </div>
        <div className="navbar-sidebar__item navbar-sidebar__item--secondary menu">
          {secondaryMenu}
        </div>
      </div>
    </div>
  );
}
