export async function selectValue(page, locator, value, query) {
  await locator.click();
  const popup = page.locator('.search-select-popup');
  await popup.waitFor();
  if (query !== undefined) await popup.getByRole('combobox').fill(query);
  await popup.locator('[role="option"]').evaluateAll((options, value) => {
    if (!options.some((option) => option.getAttribute('data-value') === value))
      throw new Error(`Option ${value} unavailable`);
  }, String(value));
  await popup
    .locator(`[role="option"][data-value="${String(value).replace(/"/g, '\\"')}"]`)
    .click();
  await popup.waitFor({ state: 'detached' });
}
