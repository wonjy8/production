import {createPageTitleEditor} from './design-system/title-editor.js';
import {installThumbnailImages} from '../production/thumbnail-images.js';
installThumbnailImages(document);
import {openAddMenu} from './action-menu.js';
window.openAddMenu=openAddMenu;
import {decorateReferenceFilters} from './reference-filters.js';
window.decorateReferenceFilters=decorateReferenceFilters;
import {installSidebarOrdering} from './sidebar-order.js';
window.installSidebarOrdering=installSidebarOrdering;
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
import {iconSVG,identityIconSVG,navigationIconSVG,hydrateSidebarIcons} from './icons.js';
window.productionUI={createPageTitleEditor,iconSVG,identityIconSVG,navigationIconSVG,observeUI,hydrateSidebarIcons};hydrateSidebarIcons(document);observeUI(document);

installItemMenus(document,target=>window.productionItemActions?.(target));

window.appAuthReady?.then(()=>window.accountGuard?.(document));
import {installHistory} from './history.js';
installHistory();

import {renderNASAliasSettings} from './nas-alias.js';
window.renderNASAliasSettings=renderNASAliasSettings;

window.dispatchEvent(new Event("production-ui-ready"));
import './workspace-nav.js';
