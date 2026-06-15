import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// Asignar las fuentes una sola vez, de forma global
(pdfMake as any).vfs = (pdfFonts as any).vfs;

// Opcional: si quieres asegurar Roboto explícitamente, descomenta las siguientes líneas.
 (pdfMake as any).fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
 };