import './accent.js';
import {installDelayedPointerDrag} from './touch-drag.js';
window.installDelayedPointerDrag=installDelayedPointerDrag;
import {renderFigmaSettings} from './figma-settings.js';
window.renderFigmaSettings=renderFigmaSettings;
import {sortMembers,reorderMembers} from '../production/member-sort.js';
window.sortMembers=sortMembers;window.reorderMembers=reorderMembers;
import {parseMemberLines} from '../production/member-import.js';
window.parseMemberImport=parseMemberLines;
import {installItemMenus} from './item-menu.js';
import {observeUI} from './decorate.js';
import {iconSVG,hydrateSidebarIcons} from './icons.js';
window.productionUI={iconSVG,observeUI,hydrateSidebarIcons};hydrateSidebarIcons(document);observeUI(document);

installItemMenus(document,target=>window.productionItemActions?.(target));

window.appAuthReady?.then(()=>window.accountGuard?.(document));
import {installHistory} from './history.js';
installHistory();

import {renderNASAliasSettings} from './nas-alias.js';
window.renderNASAliasSettings=renderNASAliasSettings;
