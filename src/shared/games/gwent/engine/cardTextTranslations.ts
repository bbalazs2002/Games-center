/**
 * Hand-written Hungarian translations of the FLAVOR-TEXT-ONLY portion of each
 * card's/leader's `cardText` (Gwent-0c.2 §F, 6. pont: "az eredeti angol
 * szöveg csak a flavor text legyen és az legyen magyarra fordítva"). NOT a
 * generated file (unlike cardDefs.ts/leaderDefs.ts) — same hand-maintained
 * pattern as specialCardIds.ts/cardBackPaths.ts.
 *
 * A card/leader missing from these maps has no separate flavor quote in its
 * `cardText` (its whole `cardText` is a rules/ability description, already
 * covered in Hungarian by CardDetailModal's own facts list + the
 * ability-explanation panel — see cardDisplay.ts's ABILITY_DESCRIPTIONS_HU)
 * — CardDetailModal/LeaderDetailModal simply omit the flavor-text block for
 * those. Keys are `CardDef.id`/`LeaderDef.id`.
 *
 * Full re-translation pass (2026-08-04): the felhasználó corrected many
 * English cardText entries via scripts/gwent-card-editor.ts (typos, restored
 * missing profanity, filled in previously-empty flavor quotes) and asked for
 * every Hungarian entry to be reviewed/redone from the corrected source —
 * explicitly permitting profanity in the translation wherever the English
 * has it (the game is 18+ regardless). Also fixes "Lodge" -> "Szövetség"
 * (was "páholy", flagged by the felhasználó as a bad term choice).
 */

export const CARD_TEXT_HU: Record<string, string> = {
  'monsters-arachas': 'Csúnya – ezzel üzeni a természet: maradj a picsába.',
  'monsters-arachas-behemoth': 'Mintha egy rák, egy pók... és egy istenverte hegy kereszteződne.',
  'monsters-botchling': 'Ismerd be a hibáid, és temesd el rendesen – különben kísérteni fognak.',
  'monsters-celaeno-harpy':
    'A közönséges hárpiák dögön élnek. A celaenói hárpiák... álmokon élnek.',
  'monsters-cockatrice': 'Kakas tojta tojásból kelt ki... ha hiszel az efféle paraszti maszlagnak.',
  'monsters-crone-brewess': 'Feldarabolunk, fiacskám. Remek leves lesz belőled.',
  'monsters-crone-weavess': 'Érzem a fájdalmad. Látom a félelmed...',
  'monsters-crone-whispess': 'Én lennék a legjobb – és az utolsó.',
  'monsters-draug':
    'Vannak, akik nem tudják beismerni a vereséget. Ők a síron túlról is harcolnak tovább.',
  'monsters-earth-elemental':
    'Hogyan harcolj egy földelementállal? Sehogy. Menekülj. Ahogy csak bírsz.',
  'monsters-endrega': 'A fészek! Pusztítsd el a fészket, különben a rohadékok csak jönnek tovább.',
  'monsters-fiend': 'A rémszarvas kicsit egy szarvasra hasonlít. Egy hatalmas, gonosz szarvasra.',
  'monsters-fire-elemental': 'A tűz olyan gyönyörűséges.',
  'monsters-foglet': 'A köd macskaléptekkel oson. A ködszellemek áldozataik holttestén osonnak át.',
  'monsters-forktail': 'Villásfarkúak... Ugyan! A rohadékok farka inkább bárdra hasonlít.',
  'monsters-frightener': '„Mit tettem?” – kiáltott fel a mágus, megrémülve saját teremtményétől.',
  'monsters-gargoyle':
    'Ősi szobrászok lidérces fantáziaképei, amiket unatkozó mágusok keltettek életre.',
  'monsters-ghoul': 'Ha a hullaevők az Élet Körének részei... akkor az egy kurva kegyetlen kör.',
  'monsters-grave-hag': 'Hosszú nyelvükkel velőt szürcsölnek – és zsákmányt csapkodnak.',
  'monsters-griffin':
    'A griffek szeretnek játszani a zsákmányukkal. Elevenen eszik meg, darabonként.',
  'monsters-harpy': 'Sokféle hárpia létezik, és mind kényszeres tolvaj.',
  'monsters-ice-giant':
    'Egyszer menekültem életemben. A jégóriás elől. És egy cseppet sem szégyellem.',
  'monsters-imlerith': 'Ladd nahw! Öljétek meg őket! Szórjátok tele a földet a beleikkel!',
  'monsters-kayran':
    'Megölni egy kayrant? Egyszerű. Fogd a legjobb kardod... aztán add el, és fogadj fel egy vajákot.',
  'monsters-leshen':
    'Ezekben az erdőkben sosem vadászunk. Még ha az egész falu éhen is hal miatta.',
  'monsters-nekker':
    'A dög jószágok majdnem édesek, ha eltekintünk a vérszomjas gyilkos oldaluktól.',
  'monsters-plague-maiden':
    'A lázas betegek egy kelésekkel borított nőről hablatynak, akit veszett patkányok hordái vesznek körül...',
  'monsters-toad': 'Nagy. Gonosz. Csúnya. A csatornában gubbaszt.',
  'monsters-vampire-bruxa':
    'Egy aljas, vérszomjas, emberevő szipirtyó. Kicsit olyan, mint az anyósom.',
  'monsters-vampire-ekimmara':
    'Ki gondolná, hogy a túlnőtt denevéreknek gyengéjük a hivalkodó ékszer?',
  'monsters-vampire-fleder':
    'A magasabb rendű vámpírok átölelik áldozataikat. A flederek darabokra tépik őket.',
  'monsters-vampire-garkain':
    'Olyan förtelmes vérszívók és hullaevők, hogy már a puszta csúfságuk is megbénítja ellenfeleiket.',
  'monsters-vampire-katakan': 'A Kontinens vérét issza a Konjunkció óta.',
  'monsters-werewolf':
    'A farkasok nem is olyan rosszak, mint mondják. A vérfarkasok viszont – azok rosszabbak.',
  'monsters-wyvern':
    'Képzelj el egy szárnyas kígyó és egy rémálom kereszteződését. A viverek rosszabbak.',
  'neutral-biting-frost':
    'A fagy legjobb tulajdonsága – az elesettek teste nem rohad meg olyan gyorsan.',
  'neutral-bovine-defense-force': 'Grrrrrr!',
  'neutral-cirilla-fiona-elen-riannon':
    'Tudod, mikor szűnik meg mese lenni a mese? Amikor az emberek elkezdenek hinni benne.',
  'neutral-clear-weather': 'Süt a nap, Dromle! Süt a nap! Talán mégis maradt még remény...',
  'neutral-commander-s-horn': 'Plusz egy a morálra, mínusz három a hallásra.',
  'neutral-cow': 'Múúú!',
  'neutral-dandelion': 'Dandelion, te egy cinikus, buja, kupec hazug vagy – és a legjobb barátom.',
  'neutral-decoy': 'Ha elfogytak a parasztok, a csalik is egészen jó nyílvesszőfogónak.',
  'neutral-emiel-regis-rohellec-terzieff':
    'Az emberek, legalábbis az udvariasabbak, szörnyetegnek hívnának. Egy vérszívó fura alaknak.',
  'neutral-gaunter-o-dimm': 'Mindig pontosan azt teljesíti, amit kívánsz. Ez a baj vele.',
  'neutral-gaunter-o-dimm-darkness': 'Ne az árnyéktól félj, hanem a fénytől.',
  'neutral-geralt-of-rivia':
    'Ha ez kell a világ megmentéséhez, jobb hagyni, hogy elpusztuljon az a világ.',
  'neutral-impenetrable-fog': 'Egy jó parancsnok álma... egy rossznak a rémálma.',
  'neutral-mysterious-elf': 'Nektek, embereknek... szokatlan az ízlésetek.',
  'neutral-olgierd-von-everec': 'Legalább most már tudod: nem veszítem el könnyen a fejem.',
  'neutral-scorch':
    'A lángoszlopok hamuvá égetik a leghatalmasabbat is. A többiek döbbenten remegnek.',
  'neutral-torrential-rain': 'Ezen a földön még az eső is vizeletszagú.',
  'neutral-triss-merigold': 'Tudok vigyázni magamra. Bízz bennem.',
  'neutral-vesemir': 'Ha felakasztanak, kérj vizet. Bármi történhet, mire odahozzák.',
  'neutral-villentretenmerth': 'Borkh Három Csókának is nevezi magát... nem a legjobb névadó.',
  'neutral-yennefer-of-vengerberg':
    'A mágia Káosz, Művészet és Tudomány. Átok, áldás és fejlődés egyszerre.',
  'neutral-zoltan-chivay': 'Az élet régi cimborák és pia nélkül olyan, mint egy nő fenék nélkül.',
  'nilfgaard-albrich': 'Egy tűzgolyó? Hogyne. Ahogy Császári Felséged óhajtja.',
  'nilfgaard-assire-var-anahid':
    'A nilfgaardi mágusoknak valóban van választásuk: alázatos meghódolás, vagy az akasztófa.',
  'nilfgaard-black-infantry-archer': 'A térdet célzom. Mindig.',
  'nilfgaard-cahir-mawr-dyffryn-aep-ceallach':
    'Szeme megvillant szárnyas sisakja alatt. Kardja pengéjén tűz csillant.',
  'nilfgaard-cynthia': 'Cynthia tehetsége halálos is lehet. Rövid pórázon kell tartani.',
  'nilfgaard-etolian-auxiliary-archers': 'Dupla vagy semmi, a faszára célzunk.',
  'nilfgaard-fringilla-vigo':
    'A mágia a legfőbb jó. Minden határon és megosztottságon felülemelkedik.',
  'nilfgaard-heavy-zerrikanian-fire-scorpion':
    'Városok bevételére nem a legjobb, de porig rombolásra kiváló.',
  'nilfgaard-impera-brigade-guard': 'Az Impera Brigád sosem adja meg magát. Soha.',
  'nilfgaard-letho-of-gulet': 'A vajákok sosem az ágyukban halnak meg.',
  'nilfgaard-menno-coehoorn':
    'Egy figyelmes felderítő egységet bármikor elcserélek egy díszes lovasdandárért.',
  'nilfgaard-morteisen':
    'Sem északi lándzsások, sem törp dárdások nem vehetik fel a versenyt egy kiképzett lovassággal.',
  'nilfgaard-morvran-voorhis':
    'A nyári nap fénye, ahogy megcsillan az Alba csendes vizén – nekem ez Nilfgaard.',
  'nilfgaard-nausicaa-cavalry-rider': 'A Császár fegyelemre tanítja majd az Északot.',
  'nilfgaard-puttkammer': 'Sokat tanult a braibanti katonai akadémián. Például krumplit pucolni.',
  'nilfgaard-rainfarn':
    'Ugyanolyan fájdalmas halált halsz majd, mint az a szánalmas áruló, Windhalm.',
  'nilfgaard-renuald-aep-matsen':
    'Azt mondják, az Impera semmitől sem fél. Nem igaz. Renualdtól halálra rémülnek.',
  'nilfgaard-rotten-mangonel': 'A rothadó bűz gyerekkori emlékeket idéz.',
  'nilfgaard-shilard-fitz-oesterlen':
    'A hadviselés csupán zaj és téboly – valójában a diplomácia formálja a történelmet.',
  'nilfgaard-siege-engineer': 'Helyesen forgatva egy szögmérő is halálos fegyver lehet.',
  'nilfgaard-siege-technician': 'Másodszorra sosem hibázom.',
  'nilfgaard-stefan-skellen':
    'A jelem ott díszeleg leendő császárnőnk arcán. Ez életem legnagyobb büszkesége.',
  'nilfgaard-sweers': 'És el a kezeket a lánytól! Bármi legyen is, nem vagyunk vadállatok.',
  'nilfgaard-tibor-eggebracht': 'Albaaaa! Előre!! Alba! Éljen a Császár!',
  'nilfgaard-vanhemar': 'Egy tűzmágustól szokatlanul... visszafogott.',
  'nilfgaard-vattier-de-rideaux':
    'Még nem volt olyan probléma, amit egy jól megtervezett merénylet ne oldott volna meg.',
  'nilfgaard-vreemde': 'A fegyelem a Birodalom legnagyobb fegyvere.',
  'nilfgaard-young-emissary':
    'Ha jól teljesítek, talán legközelebb valami civilizáltabb helyre helyeznek.',
  'nilfgaard-zerrikanian-fire-scorpion':
    'A zerrikániai sivatag valaha buja kert volt. Aztán megjelentek ezek.',
  'northern-realms-ballista':
    '„Általában női nevet adunk nekik.” – „Mondjuk Jennyt?” – „Inkább Bertát.”',
  'northern-realms-blue-stripes-commando':
    'Bármit megtennék Temeriáért. De többnyire csak ölök érte.',
  'northern-realms-catapult': 'Az istenek azoknak segítenek, akiknek jobb katapultjuk van.',
  'northern-realms-crinfrid-reavers-dragon-hunter':
    'Mostanában nem volt szerencsénk a szörnyekkel, úgyhogy inkább beálltunk katonának.',
  'northern-realms-dethmold':
    'Egyszer rávettem egy foglyot, hogy kihányja a saját beleit... Ó, szép idők...',
  'northern-realms-dun-banner-medic':
    'Vöröset a vöröshöz, fehéret a fehérhez varrjuk, és minden rendben lesz.',
  'northern-realms-esterad-thyssen':
    'Mint minden Thyssen férfi, ő is magas volt, erős testalkatú és bűnösen jóképű.',
  'northern-realms-john-natalis':
    'Azt a teret a halott katonáim nevének kellene viselnie. Nem az enyémnek.',
  'northern-realms-kaedweni-siege-expert':
    '„Öt fokkal újra kell kalibrálnod a kart.” – „Mit kell csinálnom mivel most?”',
  'northern-realms-keira-metz': 'Ha ma kell meghalnom, legalább lenyűgözően akarok kinézni hozzá.',
  'northern-realms-philippa-eilhart':
    'Hamarosan a királyok hatalma elenyészik, és a Szövetség elfoglalja jogos helyét.',
  'northern-realms-poor-fucking-infantry': 'Háborús veterán vagyok! ...nem tudsz adni egy koronát?',
  'northern-realms-prince-stennis':
    'A rohadék aranypáncélt visel. Aranyat. Persze hogy egy seggfej.',
  'northern-realms-redanian-foot-soldier':
    'Véreztem Redániáért! Öltem Redániáért... A fenébe, még erőszakoltam is Redániáért!',
  'northern-realms-sabrina-glevissig': 'A Kaedweni Vadon leánya.',
  'northern-realms-sheldon-skaggs':
    'Ott voltam, a frontvonalban! Pont ott, ahol legsűrűbb volt a harc!',
  'northern-realms-siege-tower':
    'Imádom az ostromtornyok zaját reggelente. Úgy hangzik, mint a győzelem.',
  'northern-realms-siegfried-of-denesle': 'Egy oldalon állunk, vaják. Egy nap majd rájössz erre.',
  'northern-realms-sigismund-dijkstra': 'A Gwent olyan, mint a politika, csak őszintébb.',
  'northern-realms-sile-de-tansarville':
    'A Szövetségből hiányzik az alázat. A hatalomvágyunk még a vesztünket okozhatja.',
  'northern-realms-thaler':
    'Kurva élet! Nem vagyunk mind kibaszott szoknyavadászok. Van, akiben van mélység is...',
  'northern-realms-trebuchet':
    'A vár nem dönti le saját magát, nem igaz? Gurítsátok a hajítógépeket!',
  'northern-realms-vernon-roche': 'Egy hazafi... és egy igazi kurva fia.',
  'northern-realms-ves': 'Jobb egy napig királyként élni, mint egész életen át koldusként.',
  'northern-realms-yarpen-zigrin':
    'A világ azé, aki a legjobb koponyazúzásban és lányok teherbe ejtésében.',
  'scoiatael-barclay-els':
    'A mézsörünk vizeletszagú, mi? Könnyen orvosolható – szétverem a kibaszott orrod!',
  'scoiatael-ciaran-aep-easnillien': 'A szabadsághoz vezető utat vér kövezi ki, nem tinta.',
  'scoiatael-dennis-cranmer':
    'Tudom, hogyan kell parancsot végrehajtani, úgyhogy a tanácsodat dugd fel a szeneskosaradba.',
  'scoiatael-dol-blathanna-archer':
    'Tegyél még egy lépést, dh’oine. Jobban festenél egy nyílvesszővel a szemeid között.',
  'scoiatael-dol-blathanna-scout':
    'Úgy szimatolnak, mint a vadászkutyák, úgy futnak, mint a szarvasok, és úgy ölnek, mint a hidegvérű söpredék.',
  'scoiatael-dwarven-skirmisher':
    'Egész életemben csákánnyal dolgoztam. A csatabárd nem lesz gond.',
  'scoiatael-eithne':
    'A driád királynőnek olvasztott ezüst a szeme, és hidegen kovácsolt acél a szíve.',
  'scoiatael-elven-skirmisher':
    'Bármit is hallottál, a tündék nem szednek emberi skalpokat. Túl sok rajtuk a tetű.',
  'scoiatael-filavandrel-aen-fidhail':
    'Bár most kevesen és szétszórva élünk, a szívünk sosem égett még ilyen fényesen.',
  'scoiatael-havekar-healer': 'Persze, összefoltozlak. De az pénzbe fog kerülni.',
  'scoiatael-havekar-smuggler':
    'Annak harcolok, aki a legjobban fizet. Vagy akit a legkönnyebb kirabolni.',
  'scoiatael-ida-emean-aep-sivney':
    'Bölcs vagyok. Az erőm a tudás birtoklásában rejlik. Nem a megosztásában.',
  'scoiatael-iorveth': 'Király vagy koldus, mi a különbség? Eggyel kevesebb dh’oine.',
  'scoiatael-isengrim-faoiltiarna':
    'Amint észreveszik a sebhelyemet, rájuk tör a felismerés: a közelgő halál.',
  'scoiatael-mahakaman-defender':
    'Mondom neked, mi harcra születtünk – egyenest a térdüket vágjuk!',
  'scoiatael-milva': 'Minden kilőtt nyílvesszőnél apámra gondolok. Büszke lenne rám. Azt hiszem.',
  'scoiatael-riordain':
    'Nézz a szemükbe, lakmározz a rettegésükből. Aztán csapj le a végső döfésre.',
  'scoiatael-saesenthessis': 'Szép, tiszta, vad – a tökéletes jelkép egy lázadáshoz.',
  'scoiatael-schirru': 'Ideje szembenézni a halállal.',
  'scoiatael-toruviel': 'Szívesen ölnélek meg közelről, a szemedbe nézve... De bűzlesz, ember.',
  'scoiatael-vrihedd-brigade-recruit':
    'A gyűlölet fényesebben ég minden tűznél, és mélyebben vág minden pengénél.',
  'scoiatael-vrihedd-brigade-veteran': '„Vrihedd? Az meg mit jelent?” – „Bajt.”',
  'scoiatael-yaevinn': 'Mi vagyunk az esőcseppek, amelyek együtt tomboló vihart alkotnak.',
};

export const LEADER_TEXT_HU: Record<string, string> = {
  'monsters-eredin-breacc-glas-the-treacherous': 'Élvezem ezt. Te vagy a játékszerem.',
  'monsters-eredin-bringer-of-death': 'Elkerülhetetlen.',
  'monsters-eredin-commander-of-the-red-riders':
    'Rajta. Mutasd a pördületeidet, piruetteidet és cseleidet. Szeretném nézni.',
  'monsters-eredin-destroyer-of-worlds': 'Régóta vártam már erre...',
  'monsters-eredin-king-of-the-wild-hunt': 'Legyen egy kis méltóságod. Tudod, hogyan végződik ez.',
  'nilfgaard-emhyr-var-emreis-emperor-of-nilfgaard':
    'Az indítékaid nem érdekelnek. Csak az eredmény.',
  'nilfgaard-emhyr-var-emreis-his-imperial-majesty':
    'Az egek sírtak, amikor Pavettám meghalt. Értem nem fognak sírni.',
  'nilfgaard-emhyr-var-emreis-invader-of-the-north':
    'A császárok tömegek felett uralkodnak, mégis két dolgot nem tudnak irányítani: az idejüket és a szívüket.',
  'nilfgaard-emhyr-var-emreis-the-relentless':
    'Nem a Türelmesnek hívnak. Vigyázz, nehogy téged a Fejetlennek hívjanak.',
  'nilfgaard-emhyr-var-emreis-the-white-flame':
    'A kard csupán egy eszköz a sok közül, ami egy uralkodó rendelkezésére áll.',
  'northern-realms-foltest-king-of-temeria':
    'Természetes és szép dolog, ha egy férfi szereti a húgát.',
  'northern-realms-foltest-lord-commander-of-the-north':
    'A fenébe a tanácsadókkal és a terveikkel. Én a katonáim pengéiben bízom.',
  'northern-realms-foltest-son-of-medell':
    'A fenébe is, én uralkodom ezen a földön, és nem fogok a sarkaiban osonni.',
  'northern-realms-foltest-the-siegemaster':
    'Egy jól célzott balliszta nemcsak az ellenség falait rombolja le, hanem a morálját is.',
  'northern-realms-foltest-the-steel-forged': 'Gyönyörű nap a csatához.',
  'scoiatael-francesca-findabair-daisy-of-the-valley':
    'Ne hagyd, hogy a szépségem elterelje a célzásod.',
  'scoiatael-francesca-findabair-hope-of-the-aen-seidhe':
    'Daede sian caente, Aen Seidhe en’allane ael coeden...',
  'scoiatael-francesca-findabair-pureblood-elf':
    'Hogy békében élhessünk, előbb ölnünk kell. Ez az emberi elnyomás kegyetlen végjátéka.',
  'scoiatael-francesca-findabair-queen-of-dol-blathanna':
    'A hamu megtermékenyíti a talajt. Tavaszra a völgy ismét virágba borul.',
  'scoiatael-francesca-findabair-the-beautiful':
    'Az Ősi Nép többet felejtett el, mint amennyit az emberek valaha remélhetnek megtudni.',
};
