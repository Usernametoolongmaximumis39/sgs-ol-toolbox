export function createBattleCollapse() {
  let manual = false, automatic, override;
  const collapsed = () => automatic ? override ?? true : manual;
  return {
    collapsed,
    setAutomatic(token) {
      if (token === automatic) return;
      automatic = token;
      override = undefined;
    },
    toggle() {
      const next = !collapsed();
      if (automatic) override = next;
      else manual = next;
    },
  };
}
