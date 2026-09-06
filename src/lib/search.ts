/** Consistent Persian/Arabic text and numeral matching across all search controls. */
export const normalizeSearch = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/ي|ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[,٬\u200c]/g, '')
    .trim()
    .toLocaleLowerCase('fa');
