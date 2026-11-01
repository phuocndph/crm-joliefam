// Opt-in to this workspace and its portals. PayrollSettingsPage has stronger
// descendant density rules; important minima keep these targets at 44 CSS px.
export const laborTouchScope = '[&_button:not([role=checkbox]):not([role=switch])]:!min-h-[44px] [&_button:not([role=checkbox]):not([role=switch])]:!min-w-[44px] [&_input]:!min-h-[44px] [&_summary]:!min-h-[44px] [&_label:has([role=checkbox])]:!min-h-[44px] [&_button[role=checkbox]]:!h-4 [&_button[role=checkbox]]:!min-h-4 [&_button[role=checkbox]]:!w-4 [&_button[role=checkbox]]:!min-w-4';
export const laborTouchOptions = '[&_[role=option]]:min-h-[44px]';
