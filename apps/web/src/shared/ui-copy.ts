import type { Lang } from './lang-store'

export type UiCopy = {
  navHome: string
  navStore: string
  navLab: string
  navLogin: string
  themeLight: string
  themeDark: string
  themeAriaToLight: string
  themeAriaToDark: string
  languageShortEn: string
  languageShortKo: string
  languageAriaToEn: string
  languageAriaToKo: string
  storeMetaLine: string
  storeTitle: string
  storeDescription: string
  storeAction: string
  labMetaLine: string
  labTitle: string
  labDescription: string
  labAction: string
  loginMetaLine: string
  loginTitle: string
  loginDescription: string
  loginAction: string
}

export const uiCopy: Record<Lang, UiCopy> = {
  en: {
    navHome: 'Home',
    navStore: 'Store',
    navLab: 'Lab',
    navLogin: 'Login',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeAriaToLight: 'Switch to light mode',
    themeAriaToDark: 'Switch to dark mode',
    languageShortEn: 'EN',
    languageShortKo: 'KO',
    languageAriaToEn: 'Switch to English',
    languageAriaToKo: 'Switch to Korean',
    storeMetaLine: 'Store',
    storeTitle: 'Store',
    storeDescription: 'Browse curated modules, fragments, and templates designed for fast binary delivery.',
    storeAction: 'Browse catalog',
    labMetaLine: 'Lab',
    labTitle: 'Lab',
    labDescription: 'Prototype new fragment systems, run experiments, and validate edge behaviors.',
    labAction: 'Launch experiment',
    loginMetaLine: 'Login',
    loginTitle: 'Login',
    loginDescription: 'Access your fragment workspace, release controls, and deployment history.',
    loginAction: 'Request access'
  },
  ko: {
    navHome: '\uD648',
    navStore: '\uC2A4\uD1A0\uC5B4',
    navLab: '\uB7A9',
    navLogin: '\uB85C\uADF8\uC778',
    themeLight: '\uB77C\uC774\uD2B8',
    themeDark: '\uB2E4\uD06C',
    themeAriaToLight: '\uB77C\uC774\uD2B8 \uBAA8\uB4DC\uB85C \uC804\uD658',
    themeAriaToDark: '\uB2E4\uD06C \uBAA8\uB4DC\uB85C \uC804\uD658',
    languageShortEn: 'EN',
    languageShortKo: 'KO',
    languageAriaToEn: '\uC601\uC5B4\uB85C \uC804\uD658',
    languageAriaToKo: '\uD55C\uAD6D\uC5B4\uB85C \uC804\uD658',
    storeMetaLine: '\uC2A4\uD1A0\uC5B4',
    storeTitle: '\uC2A4\uD1A0\uC5B4',
    storeDescription:
      '\uBE60\uB978 \uBC14\uC774\uB108\uB9AC \uC804\uB2EC\uC744 \uC704\uD574 \uD050\uB808\uC774\uC158\uB41C \uBAA8\uB4C8, \uD504\uB798\uADF8\uBA3C\uD2B8, \uD15C\uD50C\uB9BF\uC744 \uC0B4\uD3B4\uBCF4\uC138\uC694.',
    storeAction: '\uCE74\uD0C8\uB85C\uADF8 \uBCF4\uAE30',
    labMetaLine: '\uB7A9',
    labTitle: '\uB7A9',
    labDescription:
      '\uC0C8\uB85C\uC6B4 \uD504\uB798\uADF8\uBA3C\uD2B8 \uC2DC\uC2A4\uD15C\uC744 \uD504\uB85C\uD1A0\uD0C0\uC774\uD551\uD558\uACE0 \uC2E4\uD5D8\uC744 \uC2E4\uD589\uD574 \uC5E3\uC9C0 \uB3D9\uC791\uC744 \uAC80\uC99D\uD558\uC138\uC694.',
    labAction: '\uC2E4\uD5D8 \uC2DC\uC791',
    loginMetaLine: '\uB85C\uADF8\uC778',
    loginTitle: '\uB85C\uADF8\uC778',
    loginDescription:
      '\uD504\uB798\uADF8\uBA3C\uD2B8 \uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4, \uB9B4\uB9AC\uC2A4 \uC81C\uC5B4, \uBC30\uD3EC \uAE30\uB85D\uC5D0 \uC811\uADFC\uD558\uC138\uC694.',
    loginAction: '\uC811\uADFC \uC694\uCCAD'
  }
}

export const getUiCopy = (lang: Lang) => uiCopy[lang] ?? uiCopy.en
