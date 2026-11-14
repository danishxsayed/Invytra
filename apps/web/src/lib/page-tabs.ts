/** The tab asked for in the address (?tab=…), or the first one. */
export const pickTab = (tabs: readonly { id: string }[], asked: string | undefined) => (tabs.some((t) => t.id === asked) ? asked! : tabs[0]!.id);
