import type { ChanceCard } from './state';

/**
 * A 35 Szerencsekártya — szövegük forrása `assets/GazdalkodjOkosan/szerencsekartyak.json`
 * (a felhasználó eredeti sorszámozása helyett itt 1–35-re újraszámozva, a
 * felhasználó szerint ez javítható — docs/gazdalkodj-okosan-0a-specifikacio.md
 * §2.6/§4). A `card-08`/`card-35` szövege a felhasználói pontosítás
 * (2026-08-08) szerint már javítva (15% kamat, ill. "Lépj a 8-as mezőre!").
 */
export const CHANCE_CARDS: ChanceCard[] = [
  {
    id: 'card-01',
    text: 'Pihenés? Feltöltődés? Kikapcsolódás? Válaszd a CLUB TIHANY-t! Lépj a 21-es mezőre és fizess 280 eurót! Még egyszer dobhatsz. www.clubtihany.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 21, thenPay: 280, thenExtraRoll: true },
  },
  {
    id: 'card-02',
    text: 'Gratulálunk! A SKY EUROPE gyorsan és olcsón elrepít az európai nagyvárosokba. Fizesd ki repülőjegyed árát, amely 300 euró! Lépj a START mezőre! skyeurope.com',
    effect: { kind: 'MOVE_TO', targetIndex: 0, thenPay: 300 },
  },
  {
    id: 'card-03',
    text: 'Gratulálunk! A TESCO áruház pontgyűjtő akciójában elért pontjaidat most beválthatod ajándékainkra! Lépj a start mezőre!',
    effect: { kind: 'MOVE_TO', targetIndex: 0 },
  },
  {
    id: 'card-04',
    text: 'Jól választottál! 20 euróért telepakoltad kosarad mindenféle PICK finomsággal. Lépj a 31-es mezőre! www.pick.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 31, thenPay: 20 },
  },
  {
    id: 'card-05',
    text: 'Szeretettel várunk a TESCO áruházban! Termékeink árából most kedvezményt adunk! Így a pénztárnál 300 euró helyett csak 240 eurót kell fizetned! Lépj a 28-as mezőre!',
    effect: { kind: 'MOVE_TO', targetIndex: 28, thenPay: 240 },
  },
  {
    id: 'card-06',
    text: 'Jól takarékoskodtál, ezért az OTP Bank Rt. a Lakossági folyószámlán elhelyezett pénzed után 15% kamatot fizet.',
    effect: { kind: 'IMMEDIATE_INTEREST', ratePercent: 15 },
  },
  {
    id: 'card-07',
    text: 'Újításért 2500 eurót kapsz, amelyet az OTP Bank fizet ki.',
    effect: { kind: 'MONEY_DELTA', amount: 2500 },
  },
  {
    id: 'card-08',
    text: 'Látogass el az ALEXANDRA Könyváruházakba! A könyvek árából most törzsvásárlói kedvezményt adunk, így a pénztárnál csak 40 eurót kell fizetned. Lépj a 18-as mezőre! www.alexandra.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 18, thenPay: 40 },
  },
  {
    id: 'card-09',
    text: 'A TOTÓ-n 12-es találattal 6000 eurót nyertél, amelyet az OTP Bank fizet ki.',
    effect: { kind: 'MONEY_DELTA', amount: 6000 },
  },
  {
    id: 'card-10',
    text: 'Fizesd ki gáz- és villanyszámládat az OTP Bank Rt-nél nyitott Lakossági folyószámlán keresztül, melynek összege 40 euró. Lépj a 8-as mezőre!',
    effect: { kind: 'MOVE_TO', targetIndex: 8, thenPay: 40 },
  },
  {
    id: 'card-11',
    text: 'A BNV sorsjátékán szobabútort nyertél. Ha nincs lakásod, 3000 eurót fizet az OTP Bank Rt.',
    effect: { kind: 'GAIN_FURNITURE', item: 'szobabutor', cashIfAlreadyOwned: 3000, cashIfNoApartment: 3000 },
  },
  {
    id: 'card-12',
    text: 'Lakásod díszítsd iráni és afgán, kézi csomózású perzsaszőnyeggel, amelyet közvetlenül a gyártótól szerez be a PARWAN perzsa galéria. Lépj az 1-es mezőre! www.parwan.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 1 },
  },
  {
    id: 'card-13',
    text: 'Menj ki a Margitszigetre autóbusszal, lépj a 26-os mezőre!',
    effect: { kind: 'MOVE_TO', targetIndex: 26 },
  },
  {
    id: 'card-14',
    text: 'Kiégett a lakásod, vissza kell adnod berendezési tárgyaidat! Ha van lakásbiztosításod, az ALLIANZ BIZTOSÍTÓ kifizeti a károdat. Ha nincs, lépj a 9-es mezőre és most befizetheted a biztosításokat!',
    effect: { kind: 'FIRE_EVENT' },
  },
  {
    id: 'card-15',
    text: 'Fizess elő a HETEK c. közéleti hetilapra. Éves előfizetési díj 40 euró.',
    effect: { kind: 'MONEY_DELTA', amount: -40 },
  },
  {
    id: 'card-16',
    text: 'A LOTTÓ nyereménysorsolásán mosogatógépet nyertél.',
    effect: { kind: 'GAIN_FURNITURE', item: 'mosogatogep', cashIfAlreadyOwned: 300, cashIfNoApartment: 300 },
  },
  {
    id: 'card-17',
    text: 'A TOTÓ-n 10-es találattal 400 eurót nyertél, amelyet az OTP Bank Rt. fizet ki.',
    effect: { kind: 'MONEY_DELTA', amount: 400 },
  },
  {
    id: 'card-18',
    text: 'Visegrádi hajókiránduláson veszel részt. Lépj a 24-es mezőre!',
    effect: { kind: 'MOVE_TO', targetIndex: 24 },
  },
  {
    id: 'card-19',
    text: 'Jól szeretnél mulatni? Nos tessék! Lépj a 6-os mezőre, és fizess 100 eurót!',
    effect: { kind: 'MOVE_TO', targetIndex: 6, thenPay: 100 },
  },
  {
    id: 'card-20',
    text: 'Vacsorajegyet nyertél a ZILA KÁVÉHÁZ és ÉTTEREMBE. Lépj a 4-es mezőre! www.zilakavehaz.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 4 },
  },
  {
    id: 'card-21',
    text: 'Konyhabútort a HANÁK KONYHABÚTOR kínálatából vásárolhatsz, ha már van lakásod. Lépj a 11-es mezőre! www.hanak-konyha.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 11 },
  },
  {
    id: 'card-22',
    text: 'Ellopták az autódat, add vissza az autókártyádat! Ha van autóbiztosításod, a bank kifizeti károdat. Ha nincs, lépj a 9-es mezőre, az ALLIANZ BIZTOSÍTÓ-nál megkötheted. www.allianz.hu',
    effect: { kind: 'CAR_THEFT' },
  },
  {
    id: 'card-23',
    text: 'A TOTÓ-n 11-es találattal 2000 eurót nyertél, amelyet az OTP Bank fizet ki.',
    effect: { kind: 'MONEY_DELTA', amount: 2000 },
  },
  {
    id: 'card-24',
    text: 'Az INVITEL-nél "kettő-az-egyben" csomagra szerződtél, mely a telefon mellett az Internet-hozzáférés díját is tartalmazza, így ez csak 20 euróba kerül. Lépj a 40-es mezőre! www.invitel.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 40 },
  },
  {
    id: 'card-25',
    text: 'A LOTTÓ 10. játékhetén 10.000 eurót nyertél, amelyet az OTP Bank Rt. fizet ki.',
    effect: { kind: 'MONEY_DELTA', amount: 10000 },
  },
  {
    id: 'card-26',
    text: 'A Budapesti Nemzetközi Vásár sorsjátékán mosógépet nyertél.',
    effect: { kind: 'GAIN_FURNITURE', item: 'mosogep', cashIfAlreadyOwned: 300, cashIfNoApartment: 300 },
  },
  {
    id: 'card-27',
    text: 'Jó munkádért 1000 euró jutalomban részesülsz, amelyet az OTP Bank Rt. fizet ki.',
    effect: { kind: 'MONEY_DELTA', amount: 1000 },
  },
  {
    id: 'card-28',
    text: 'Menj a START mezőre, és vegyél fel az OTP Bank Rt.-től 4000 eurót.',
    effect: { kind: 'MOVE_TO', targetIndex: 0 },
  },
  {
    id: 'card-29',
    text: '3-as találatod volt a LOTTÓ-n, 800 eurót kapsz az OTP Bank-tól.',
    effect: { kind: 'MONEY_DELTA', amount: 800 },
  },
  {
    id: 'card-30',
    text: 'Háztartásodat ELECTROLUX készülékekkel szerelheted fel, amelyek megkönnyíthetik hétköznapjaidat. Lépj a 33-as mezőbe! www.electrolux.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 33 },
  },
  {
    id: 'card-31',
    text: 'Takarékoskodj! A megtakarított pénzedet tartsd a Lakossági folyószámládon, melyre OTP Bank Rt. 7%-os kamatot fizet. Lépj a 8-as mezőre!',
    effect: { kind: 'MOVE_TO', targetIndex: 8 },
  },
  {
    id: 'card-32',
    text: 'Fizess elő a Népszava c. napilapra. Éves előfizetési díj 60 euró.',
    effect: { kind: 'MONEY_DELTA', amount: -60 },
  },
  {
    id: 'card-33',
    text: 'Ebédelj barátaiddal a lőrinci KAKAS ÉTTEREMBEN, egy mediterrán hangulatú helyen. Lépj a 25-ös mezőre! www.kakas.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 25 },
  },
  {
    id: 'card-34',
    text: 'CITROEN M5 CENTERBEN vásárolj! Lépj az 5-ös mezőre és élvezd az új C4-est! www.citroenm5center.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 5 },
  },
  {
    id: 'card-35',
    text: 'A VISTA UTAZÁSI IRODÁK nyereménysorsolásán utazást nyertél, kipihenten folytathatod utadat. Lépj a 30-as mezőre! www.vista.hu',
    effect: { kind: 'MOVE_TO', targetIndex: 30 },
  },
];
