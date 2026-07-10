/* ============================================================
   musicData.js — Arknights music database
   Source: https://prts.wiki/w/音乐鉴赏
   Audio: NetEase Cloud Music URLs + PRTS wiki direct links
   Total: ~189 tracks across EP Y-0~Y-7 + Overseas + 系统(System)
   ============================================================ */

const MUSIC_LIBRARY = (() => {

    /**
     * Each track:
     *   id          — unique slug
     *   title       — primary display title (Chinese or English)
     *   titleEn     — English / romanized title
     *   titleCn     — Chinese title (if primary is English)
     *   ep          — EP category
     *   neteaseId   — NetEase Cloud Music song ID (null if unavailable)
     *   url         — direct audio URL (for non-NetEase tracks, e.g. PRTS wiki)
     *
     * Audio URL priority: url > neteaseId > null
     */
    const tracks = [

        // =============================================
        // 独立单曲 Y-7
        // =============================================
        { id:'y7-01', title:'Innocence',                titleEn:'Innocence',                ep:'Y-7', neteaseId:3375918502 },
        { id:'y7-02', title:'All by My Design',          titleEn:'All by My Design',          ep:'Y-7', neteaseId:3376569082 },
        { id:'y7-03', title:"Don't Miss It",             titleEn:"Don't Miss It",             ep:'Y-7', neteaseId:3376714297 },
        { id:'y7-04', title:'夏日远去之后',                titleCn:'夏日远去之后',          titleEn:'Summer Fades Away',       ep:'Y-7', neteaseId:3390243136 },

        // =============================================
        // 独立单曲 Y-6
        // =============================================
        { id:'y6-01', title:'Heavenly Me',               titleEn:'Heavenly Me',               ep:'Y-6', neteaseId:2699629221 },
        { id:'y6-02', title:'Sanctuary Inside',          titleEn:'Sanctuary Inside',          ep:'Y-6', neteaseId:2699626075 },
        { id:'y6-03', title:'Still the Same',            titleEn:'Still the Same',            ep:'Y-6', neteaseId:2699921361 },
        { id:'y6-04', title:'The After',                 titleEn:'The After',                 ep:'Y-6', neteaseId:2709403466 },
        { id:'y6-05', title:'Grow on My Time',           titleEn:'Grow on My Time',           ep:'Y-6', neteaseId:2712336626 },
        { id:'y6-06', title:'Mare Natus',                titleEn:'Mare Natus',                ep:'Y-6', neteaseId:2719304071 },
        { id:'y6-07', title:'惊蛰时',                     titleCn:'惊蛰时',                titleEn:'Jingzhe Shi',             ep:'Y-6', neteaseId:2723357459 },
        { id:'y6-08', title:'Summer Fizz Pop',           titleEn:'Summer Fizz Pop',           ep:'Y-6', neteaseId:2728405343 },
        { id:'y6-09', title:'Undaunted',                 titleEn:'Undaunted',                 ep:'Y-6', neteaseId:2731345249 },
        { id:'y6-10', title:'Little Wish',               titleEn:'Little Wish',               ep:'Y-6', neteaseId:2731325796 },
        { id:'y6-11', title:'碧い瞳の中に',                titleCn:'碧い瞳の中に',          titleEn:'In Those Blue Eyes',      ep:'Y-6', neteaseId:2742468679 },
        { id:'y6-12', title:'Sealed',                    titleEn:'Sealed',                    ep:'Y-6', neteaseId:2751379003 },
        { id:'y6-13', title:'Paper Boat',                titleEn:'Paper Boat',                ep:'Y-6', neteaseId:2755406555 },
        { id:'y6-14', title:'The Walk',                  titleEn:'The Walk',                  ep:'Y-6', neteaseId:3312932682 },
        { id:'y6-15', title:'Follow Your Heart',         titleEn:'Follow Your Heart',         ep:'Y-6', neteaseId:3312937331 },
        { id:'y6-16', title:'Stardust on Me',            titleEn:'Stardust on Me',            ep:'Y-6', neteaseId:3312321567 },
        { id:'y6-17', title:'Secret Escape',             titleEn:'Secret Escape',             ep:'Y-6', neteaseId:3320047162 },
        { id:'y6-18', title:'Just Another Inch Higher',  titleEn:'Just Another Inch Higher',  ep:'Y-6', neteaseId:3324518630 },
        { id:'y6-19', title:'Slowly Flow, Hearthlight Glow', titleEn:'Slowly Flow, Hearthlight Glow', ep:'Y-6', neteaseId:3332141362 },
        { id:'y6-20', title:'Wanna Know Me? (Too Bad)',  titleEn:'Wanna Know Me? (Too Bad)',  ep:'Y-6', neteaseId:3336875557 },
        { id:'y6-21', title:'铁花飞',                     titleCn:'铁花飞',                titleEn:'Iron Flowers Fly',        ep:'Y-6', neteaseId:3342981041 },
        { id:'y6-22', title:'无名策',                     titleCn:'无名策',                titleEn:'Unnamed Strategy',        ep:'Y-6', neteaseId:3348083045 },
        { id:'y6-23', title:'花街迎春',                   titleCn:'花街迎春',              titleEn:'Flower Street Welcomes Spring', ep:'Y-6', neteaseId:3349298940 },
        { id:'y6-24', title:'Oath',                      titleEn:'Oath',                      ep:'Y-6', neteaseId:3356429632 },
        { id:'y6-25', title:'One Fight',                 titleEn:'One Fight',                 ep:'Y-6', neteaseId:3366069939 },
        { id:'y6-26', title:'In Due Time',               titleEn:'In Due Time',               ep:'Y-6', neteaseId:3368494293 },

        // =============================================
        // 独立单曲 Y-5
        // =============================================
        { id:'y5-01', title:'Arsonist',                  titleEn:'Arsonist',                  ep:'Y-5', neteaseId:2151202025 },
        { id:'y5-02', title:'Whistle Stop',              titleEn:'Whistle Stop',              ep:'Y-5', neteaseId:2151215639 },
        { id:'y5-03', title:'Echoism',                   titleEn:'Echoism',                   ep:'Y-5', neteaseId:2151230759 },
        { id:'y5-04', title:'I Will Touch the Sky',      titleEn:'I Will Touch the Sky',      ep:'Y-5', neteaseId:2158229087 },
        { id:'y5-05', title:'Vows of the Sea',           titleEn:'Vows of the Sea',           ep:'Y-5', neteaseId:2163240287 },
        { id:'y5-06', title:'Chase the Light',           titleEn:'Chase the Light',           ep:'Y-5', neteaseId:2163262921 },
        { id:'y5-07', title:'Warm and Small Light',      titleEn:'Warm and Small Light',      ep:'Y-5', neteaseId:2603903847 },
        { id:'y5-08', title:'Mystic Light Quest',        titleEn:'Mystic Light Quest',        ep:'Y-5', neteaseId:2612747239 },
        { id:'y5-09', title:"Nightmare's Descent",       titleEn:"Nightmare's Descent",       ep:'Y-5', neteaseId:2612754800 },
        { id:'y5-10', title:'Reforge',                   titleEn:'Reforge',                   ep:'Y-5', neteaseId:2634494722 },
        { id:'y5-11', title:'Unmask',                    titleEn:'Unmask',                    ep:'Y-5', neteaseId:2641866088 },
        { id:'y5-12', title:'Bloodstained Oath',         titleEn:'Bloodstained Oath',         ep:'Y-5', neteaseId:2641892207 },
        { id:'y5-13', title:'Figure It Out',             titleEn:'Figure It Out',             ep:'Y-5', neteaseId:2641910121 },
        { id:'y5-14', title:'Sailing For',               titleEn:'Sailing For',               ep:'Y-5', neteaseId:2653069255 },
        { id:'y5-15', title:'WE',                        titleEn:'WE',                        ep:'Y-5', neteaseId:2657389215 },
        { id:'y5-16', title:'Tranquil Snow',             titleEn:'Tranquil Snow',             ep:'Y-5', neteaseId:2659584604 },
        { id:'y5-17', title:'滋味常',                     titleCn:'滋味常',                titleEn:'Everlasting Taste',       ep:'Y-5', neteaseId:2668038573 },
        { id:'y5-18', title:'烛影暖',                     titleCn:'烛影暖',                titleEn:'Warm Candlelight',        ep:'Y-5', neteaseId:2667701653 },
        { id:'y5-19', title:'此时圆',                     titleCn:'此时圆',                titleEn:'Full Circle',             ep:'Y-5', neteaseId:2668992231 },
        { id:'y5-20', title:'Epilogue',                  titleEn:'Epilogue',                  ep:'Y-5', neteaseId:2674117618 },
        { id:'y5-21', title:'Final Embrace',             titleEn:'Final Embrace',             ep:'Y-5', neteaseId:2681372601 },
        { id:'y5-22', title:'Skeletal Wings',            titleEn:'Skeletal Wings',            ep:'Y-5', neteaseId:2691003687 },
        { id:'y5-23', title:'From Ash to Fire',          titleEn:'From Ash to Fire',          ep:'Y-5', neteaseId:2694550945 },

        // =============================================
        // 独立单曲 Y-4
        // =============================================
        { id:'y4-01', title:'Morning Dew',               titleEn:'Morning Dew',               ep:'Y-4', neteaseId:2042849489 },
        { id:'y4-02', title:'Dormant Craving',           titleEn:'Dormant Craving',           ep:'Y-4', neteaseId:2042872786 },
        { id:'y4-03', title:'The cure',                  titleEn:'The cure',                  ep:'Y-4', neteaseId:2042920491 },
        { id:'y4-04', title:'Stained',                   titleEn:'Stained',                   ep:'Y-4', neteaseId:2051793162 },
        { id:'y4-05', title:'Before Summer',             titleEn:'Before Summer',             ep:'Y-4', neteaseId:2051789190 },
        { id:'y4-06', title:'Before & After',            titleEn:'Before & After',            ep:'Y-4', neteaseId:2058566896 },
        { id:'y4-07', title:'Mortal Eye',                titleEn:'Mortal Eye',                ep:'Y-4', neteaseId:2060731820 },
        { id:'y4-08', title:'Miss You',                  titleEn:'Miss You',                  ep:'Y-4', neteaseId:2068111443 },
        { id:'y4-09', title:'Missy',                     titleEn:'Missy',                     ep:'Y-4', neteaseId:2069005111 },
        { id:'y4-10', title:'Beautiful & Lovely',        titleEn:'Beautiful & Lovely',        ep:'Y-4', neteaseId:2074366900 },
        { id:'y4-11', title:'Water Quench',              titleEn:'Water Quench',              ep:'Y-4', neteaseId:2078070386 },
        { id:'y4-12', title:'Settle Into Ash',           titleEn:'Settle Into Ash',           ep:'Y-4', neteaseId:2088472839 },
        { id:'y4-13', title:'Best Moments of...',        titleEn:'Best Moments of...',        ep:'Y-4', neteaseId:2091885618 },
        { id:'y4-14', title:'Revealing',                 titleEn:'Revealing',                 ep:'Y-4', neteaseId:2095549817 },
        { id:'y4-15', title:'Illuminate',                titleEn:'Illuminate',                ep:'Y-4', neteaseId:2095246083 },
        { id:'y4-16', title:'Lessing',                   titleEn:'Lessing',                   ep:'Y-4', neteaseId:2095181378 },
        { id:'y4-17', title:'Blade Catcher',             titleEn:'Blade Catcher',             ep:'Y-4', neteaseId:2102690163 },
        { id:'y4-18', title:'Snow Parade',               titleEn:'Snow Parade',               ep:'Y-4', neteaseId:2110359806 },
        { id:'y4-19', title:'(Believed Believes) Believing', titleEn:'(Believed Believes) Believing', ep:'Y-4', neteaseId:2111780858 },
        { id:'y4-20', title:'Winged Step',               titleEn:'Winged Step',               ep:'Y-4', neteaseId:2114750011 },
        { id:'y4-21', title:'浸春芜',                     titleCn:'浸春芜',                titleEn:'Immersed in Spring Weeds', ep:'Y-4', neteaseId:2122534120 },
        { id:'y4-22', title:'清平乐',                     titleCn:'清平乐',                titleEn:'Pure Serene Music',        ep:'Y-4', neteaseId:2122595714 },
        { id:'y4-23', title:'Yanking',                   titleEn:'Yanking',                   ep:'Y-4', neteaseId:2124421466 },
        { id:'y4-24', title:'ONE BY ONE',                titleEn:'ONE BY ONE',                ep:'Y-4', neteaseId:2143964670 },

        // =============================================
        // 独立单曲 Y-3
        // =============================================
        { id:'y3-01', title:'Awaken',                    titleEn:'Awaken',                    ep:'Y-3', neteaseId:1941653825 },
        { id:'y3-02', title:'Rapier',                    titleEn:'Rapier',                    ep:'Y-3', neteaseId:1941656969 },
        { id:'y3-03', title:'Bluish Light',              titleEn:'Bluish Light',              ep:'Y-3', neteaseId:1941658812 },
        { id:'y3-04', title:"Hunter's Song",             titleEn:"Hunter's Song",             ep:'Y-3', neteaseId:1945303958 },
        { id:'y3-05', title:'Your Star',                 titleEn:'Your Star',                 ep:'Y-3', neteaseId:1953860839 },
        { id:'y3-06', title:'Ständchen',                 titleEn:'Ständchen',                 ep:'Y-3', neteaseId:1953863738 },
        { id:'y3-07', title:'Magic Theorem',             titleEn:'Magic Theorem',             ep:'Y-3', neteaseId:1960301055 },
        { id:'y3-08', title:'A Long Vacation',           titleEn:'A Long Vacation',           ep:'Y-3', neteaseId:1962337725 },
        { id:'y3-09', title:'All hail Savior!',          titleEn:'All hail Savior!',          ep:'Y-3', neteaseId:1971060661 },
        { id:'y3-10', title:'Undertopia',                titleEn:'Undertopia',                ep:'Y-3', neteaseId:1971052096 },
        { id:'y3-11', title:'Ensheath',                  titleEn:'Ensheath',                  ep:'Y-3', neteaseId:1978870845 },
        { id:'y3-12', title:'A Sweet Rendez-vous',       titleEn:'A Sweet Rendez-vous',       ep:'Y-3', neteaseId:1985324290 },
        { id:'y3-13', title:'Stainless Heart',           titleEn:'Stainless Heart',           ep:'Y-3', neteaseId:1985642223 },
        { id:'y3-14', title:'Rekindle',                  titleEn:'Rekindle',                  ep:'Y-3', neteaseId:1988460950 },
        { id:'y3-15', title:'Running In The Dark',       titleEn:'Running In The Dark',       ep:'Y-3', neteaseId:1990154664 },
        { id:'y3-16', title:'Thorns In You',             titleEn:'Thorns In You',             ep:'Y-3', neteaseId:1992988615 },
        { id:'y3-17', title:'Sentenced',                 titleEn:'Sentenced',                 ep:'Y-3', neteaseId:1993340899 },
        { id:'y3-18', title:'Go My Way',                 titleEn:'Go My Way',                 ep:'Y-3', neteaseId:1994485658 },
        { id:'y3-19', title:'Flame Shadow',              titleEn:'Flame Shadow',              ep:'Y-3', neteaseId:2006550948 },
        { id:'y3-20', title:'Snowy Night',               titleEn:'Snowy Night',               ep:'Y-3', neteaseId:2008728404 },
        { id:'y3-21', title:'A Cold Call',               titleEn:'A Cold Call',               ep:'Y-3', neteaseId:2009965933 },
        { id:'y3-22', title:'定风波',                     titleCn:'定风波',                titleEn:'Calming Wind and Waves',   ep:'Y-3', neteaseId:2013735452 },
        { id:'y3-23', title:'近尘烟',                     titleCn:'近尘烟',                titleEn:'Close to Dust and Smoke',  ep:'Y-3', neteaseId:2013746250 },
        { id:'y3-24', title:'兔兔在哪里？',               titleCn:'兔兔在哪里？',          titleEn:'Where is Rabbit?',        ep:'Y-3', neteaseId:2013933995 },
        { id:'y3-25', title:'春岚',                       titleCn:'春岚',                  titleEn:'Spring Mist',             ep:'Y-3', neteaseId:2021168484 },
        { id:'y3-26', title:'Squad Unknown',             titleEn:'Squad Unknown',             ep:'Y-3', neteaseId:2035913457 },

        // =============================================
        // 独立单曲 Y-2
        // =============================================
        { id:'y2-01', title:'Voices',                    titleEn:'Voices',                    ep:'Y-2', neteaseId:1840981141 },
        { id:'y2-02', title:'Immutable',                 titleEn:'Immutable',                 ep:'Y-2', neteaseId:1840976599 },
        { id:'y2-03', title:'Real Me',                   titleEn:'Real Me',                   ep:'Y-2', neteaseId:1847970242 },
        { id:'y2-04', title:'Heart Forest',              titleEn:'Heart Forest',              ep:'Y-2', neteaseId:1850210271 },
        { id:'y2-05', title:'Keep the torch',            titleEn:'Keep the torch',            ep:'Y-2', neteaseId:1855194364 },
        { id:'y2-06', title:'Across the wind',           titleEn:'Across the wind',           ep:'Y-2', neteaseId:1865098460 },
        { id:'y2-07', title:'Y1K',                       titleEn:'Y1K',                       ep:'Y-2', neteaseId:1865105781 },
        { id:'y2-08', title:'Towards Her Light',         titleEn:'Towards Her Light',         ep:'Y-2', neteaseId:1876956006 },
        { id:'y2-09', title:'Bridge to the Dawn',        titleEn:'Bridge to the Dawn',        ep:'Y-2', neteaseId:1886668990 },
        { id:'y2-10', title:'Proof of being alive',      titleEn:'Proof of being alive',      ep:'Y-2', neteaseId:1888874634 },
        { id:'y2-11', title:'Radiant',                   titleEn:'Radiant',                   ep:'Y-2', neteaseId:1890402858 },
        { id:'y2-12', title:'Field in the Light',        titleEn:'Field in the Light',        ep:'Y-2', neteaseId:1890404817 },
        { id:'y2-13', title:'Heal the World',            titleEn:'Heal the World',            ep:'Y-2', neteaseId:1903164950 },
        { id:'y2-14', title:'Melting White',             titleEn:'Melting White',             ep:'Y-2', neteaseId:1903957351 },
        { id:'y2-15', title:'Silver Lining',             titleEn:'Silver Lining',             ep:'Y-2', neteaseId:1907801055 },
        { id:'y2-16', title:'醉飞尘',                     titleCn:'醉飞尘',                titleEn:'Drunk on Flying Dust',    ep:'Y-2', neteaseId:1913463815 },
        { id:'y2-17', title:'却阑珊',                     titleCn:'却阑珊',                titleEn:'Fading Indifferently',    ep:'Y-2', neteaseId:1913876873 },
        { id:'y2-18', title:'将进酒',                     titleCn:'将进酒',                titleEn:'Invitation to Wine',      ep:'Y-2', neteaseId:1914891754 },
        { id:'y2-19', title:'随意随意呀',                 titleCn:'随意随意呀',            titleEn:'Casually Casually',       ep:'Y-2', neteaseId:1913466746 },
        { id:'y2-20', title:'Spark for Dream',           titleEn:'Spark for Dream',           ep:'Y-2', neteaseId:1919486276 },
        { id:'y2-21', title:'Прощание',                   titleEn:'Proshchanie',               titleCn:'Прощание',           ep:'Y-2', neteaseId:1922349072 },
        { id:'y2-22', title:'Eternal Flame',             titleEn:'Eternal Flame',             ep:'Y-2', neteaseId:1927441611 },
        { id:'y2-23', title:'March On!',                 titleEn:'March On!',                 ep:'Y-2', neteaseId:1936324213 },
        { id:'y2-24', title:'A Grand Adventure',         titleEn:'A Grand Adventure',         ep:'Y-2', neteaseId:1939239925 },

        // =============================================
        // 独立单曲 Y-0 ~ Y-1
        // =============================================
        { id:'y01-01', title:'嚣',                        titleCn:'嚣',                    titleEn:'Xiao / Clamor',           ep:'Y-0～Y-1', neteaseId:null }, // 龙门EP已绝版，仅本地文件
        { id:'y01-02', title:'Speed of Light',           titleEn:'Speed of Light',           ep:'Y-0～Y-1', neteaseId:1403774122 },
        { id:'y01-03', title:'Zone 10⁻⁸',                titleEn:'Zone 10⁻⁸',                 ep:'Y-0～Y-1', neteaseId:1406452570 },
        { id:'y01-04', title:'Boiling Blood',            titleEn:'Boiling Blood',            ep:'Y-0～Y-1', neteaseId:1411527086 },
        { id:'y01-05', title:'示岁',                       titleCn:'示岁',                  titleEn:'Revealing the Years',     ep:'Y-0～Y-1', neteaseId:1417483463 },
        { id:'y01-06', title:'Operation Barrenland',     titleEn:'Operation Barrenland',     ep:'Y-0～Y-1', neteaseId:1428299645 },
        { id:'y01-07', title:'故乡的风',                   titleCn:'故乡的风',              titleEn:'Wind of Hometown',        ep:'Y-0～Y-1', neteaseId:1431593851 },
        { id:'y01-08', title:'春弦',                       titleCn:'春弦',                  titleEn:'Spring String',           ep:'Y-0～Y-1', neteaseId:1436614177 },
        { id:'y01-09', title:'Curtain Call',             titleEn:'Curtain Call',             ep:'Y-0～Y-1', neteaseId:1442033701 },
        { id:'y01-10', title:'Renegade',                 titleEn:'Renegade',                 ep:'Y-0～Y-1', neteaseId:1444493657 },
        { id:'y01-11', title:'Requiem',                  titleEn:'Requiem',                  ep:'Y-0～Y-1', neteaseId:1444493780 },
        { id:'y01-12', title:'Sparkling Hydraulics',     titleEn:'Sparkling Hydraulics',     ep:'Y-0～Y-1', neteaseId:1444503072 },
        { id:'y01-13', title:'Reversed Time',            titleEn:'Reversed Time',            ep:'Y-0～Y-1', neteaseId:1451700083 },
        { id:'y01-14', title:'УраУра',                    titleEn:'UraUra',                    titleCn:'УраУра',             ep:'Y-0～Y-1', neteaseId:1456166166 },
        { id:'y01-15', title:"Everything's Alright",     titleEn:"Everything's Alright",     ep:'Y-0～Y-1', neteaseId:1460626792 },
        { id:'y01-16', title:'Lily of the Valley',       titleEn:'Lily of the Valley',       ep:'Y-0～Y-1', neteaseId:1462342505 },
        { id:'y01-17', title:'夏浪',                       titleCn:'夏浪',                  titleEn:'Summer Wave',             ep:'Y-0～Y-1', neteaseId:1467848445 },
        { id:'y01-18', title:'El Brillo Solitario',      titleEn:'El Brillo Solitario',      ep:'Y-0～Y-1', neteaseId:1470071584 },
        { id:'y01-19', title:'Evolutionary Mechanization', titleEn:'Evolutionary Mechanization', ep:'Y-0～Y-1', neteaseId:1473615377 },
        { id:'y01-20', title:'ALIVE',                     titleEn:'ALIVE',                     ep:'Y-0～Y-1', neteaseId:1473615924 },
        { id:'y01-21', title:'Reconnection',              titleEn:'Reconnection',              ep:'Y-0～Y-1', neteaseId:1481447983 },
        { id:'y01-22', title:'秋绪',                       titleCn:'秋绪',                  titleEn:'Autumn Sentiments',       ep:'Y-0～Y-1', neteaseId:1485858993 },
        { id:'y01-23', title:'Stay Gold',                 titleEn:'Stay Gold',                 ep:'Y-0～Y-1', neteaseId:1488275299 },
        { id:'y01-24', title:'CONFRONT',                  titleEn:'CONFRONT',                  ep:'Y-0～Y-1', neteaseId:1491495554 },
        { id:'y01-25', title:'Lullabye',                  titleEn:'Lullabye',                  ep:'Y-0～Y-1', neteaseId:1491503292 },
        { id:'y01-26', title:'LITHOS',                    titleEn:'LITHOS',                    ep:'Y-0～Y-1', neteaseId:1491511460 },
        { id:'y01-27', title:'Crystallize',               titleEn:'Crystallize',               ep:'Y-0～Y-1', neteaseId:1499781983 },
        { id:'y01-28', title:'Tipsy',                     titleEn:'Tipsy',                     ep:'Y-0～Y-1', neteaseId:1804654314 },
        { id:'y01-29', title:'Rock the Night Away',       titleEn:'Rock the Night Away',       ep:'Y-0～Y-1', neteaseId:1806528693 },
        { id:'y01-30', title:'冬涤',                       titleCn:'冬涤',                  titleEn:'Winter Wash',             ep:'Y-0～Y-1', neteaseId:1809781249 },
        { id:'y01-31', title:'尽波澜',                     titleCn:'尽波澜',                titleEn:'End of Turmoil',          ep:'Y-0～Y-1', neteaseId:1817667813 },
        { id:'y01-32', title:'更阑影',                     titleCn:'更阑影',                titleEn:'Deeper Night Shadow',     ep:'Y-0～Y-1', neteaseId:1818074345 },
        { id:'y01-33', title:'观心',                       titleCn:'观心',                  titleEn:'Observing the Heart',     ep:'Y-0～Y-1', neteaseId:1822538485 },
        { id:'y01-34', title:'Daydaydream',               titleEn:'Daydaydream',               ep:'Y-0～Y-1', neteaseId:1828858733 },
        { id:'y01-35', title:'Gearing Up',                titleEn:'Gearing Up',                ep:'Y-0～Y-1', neteaseId:1837237665 },
        { id:'y01-36', title:'Hold Onto The Light',       titleEn:'Hold Onto The Light',       ep:'Y-0～Y-1', neteaseId:1839205789 },
        { id:'y01-37', title:'Feels',                     titleEn:'Feels',                     ep:'Y-0～Y-1', neteaseId:1839207650 },

        // =============================================
        // 外服单曲 (Overseas Server Singles)
        // =============================================
        { id:'os-01', title:'Save Us From Ourselves',     titleEn:'Save Us From Ourselves',     ep:'Overseas', neteaseId:null }, // 仅 Spotify / QQ音乐
        { id:'os-02', title:'Survive',                    titleEn:'Survive',                    ep:'Overseas', neteaseId:null }, // 仅 Spotify / QQ音乐
        { id:'os-03', title:'After It All',               titleEn:'After It All',               ep:'Overseas', neteaseId:1444021416 },
        { id:'os-04', title:'Untitled world',             titleEn:'Untitled world',             ep:'Overseas', neteaseId:1455699833 },
        { id:'os-05', title:'Last Of Me',                 titleEn:'Last Of Me',                 ep:'Overseas', neteaseId:1457694617 },
        { id:'os-06', title:'Come to Light',              titleEn:'Come to Light',              ep:'Overseas', neteaseId:1806172146 },
        { id:'os-07', title:'End Like This',              titleEn:'End Like This',              ep:'Overseas', neteaseId:1807756571 },
        { id:'os-08', title:'Never Give Up',              titleEn:'Never Give Up',              ep:'Overseas', neteaseId:1940330897 },
        { id:'os-09', title:'Lean On',                    titleEn:'Lean On',                    ep:'Overseas', neteaseId:2010173461 },
        { id:'os-10', title:'I Believe In Us',            titleEn:'I Believe In Us',            ep:'Overseas', neteaseId:1898207965 },
        { id:'os-11', title:'Two Feet On The Ground',     titleEn:'Two Feet On The Ground',     ep:'Overseas', neteaseId:1940330748 },
        { id:'os-12', title:"Ain't Seen Nothing Like This", titleEn:"Ain't Seen Nothing Like This", ep:'Overseas', neteaseId:1940327964 },
        { id:'os-13', title:'Wildfire',                   titleEn:'Wildfire',                   ep:'Overseas', neteaseId:2009755514 },
        { id:'os-14', title:'Keep Holding On',            titleEn:'Keep Holding On',            ep:'Overseas', neteaseId:2010174550 },
        { id:'os-15', title:'We Will Rise',               titleEn:'We Will Rise',               ep:'Overseas', neteaseId:2010175755 },
        { id:'os-16', title:'Day By Day',                 titleEn:'Day By Day',                 ep:'Overseas', neteaseId:2032510846 },
        { id:'os-17', title:'Unbreakable',                titleEn:'Unbreakable',                ep:'Overseas', neteaseId:2134764293 },
        { id:'os-18', title:'Ripples',                    titleEn:'Ripples',                    ep:'Overseas', neteaseId:null }, // 仅 Spotify / Apple Music

        // =============================================
        // 系统 BGM（登录界面 / 战斗结算等）
        // 来源：PRTS wiki 直链，无网易云版本
        // =============================================
        { id:'sys-01', title:'Rhodes Island',              titleCn:'初版登录界面曲',         titleEn:'Rhodes Island (Original)',   ep:'系统', url:'https://static.prts.wiki/deprecated/music/beta2_180603/m_sys_title_combine.mp3' },
        { id:'sys-02', title:'Rhodes Island (2nd Edition)', titleCn:'罗德岛（第二版）',      titleEn:'Rhodes Island (2nd Edition)', ep:'系统', url:'https://static.prts.wiki/music/music/beta2_180603/m_sys_title_combine.mp3' },
        { id:'sys-03', title:'生命流',                      titleEn:'Life Flow',               ep:'系统', url:'https://static.prts.wiki/music/music/beta1_180603/m_sys_void_combine.mp3' },
        { id:'sys-04', title:'泛用型自动化解决方案0.3.2.9f2',  titleEn:'General-Purpose Auto-Solution 0.3.2.9f2', ep:'系统', url:'https://static.prts.wiki/music/music/beta3_181101/m_sys_science_combine.mp3' },
        { id:'sys-05', title:'休憩',                        titleEn:'Rest',                    ep:'系统', url:'https://static.prts.wiki/music/music/obt/m_sys_shop_combine.mp3' },
        { id:'sys-06', title:'终局抵抗者',                   titleEn:'Final Resistance',        ep:'系统', url:'https://static.prts.wiki/music/music/beta1_180603/m_bat_victory_combine.mp3' },
        { id:'sys-07', title:'血液',                        titleEn:'Blood',                   ep:'系统', url:'https://static.prts.wiki/music/music/beta1_180603/m_bat_failed_combine.mp3' },
    ];

    /** EP category display order */
    const EP_ORDER = ['Y-7', 'Y-6', 'Y-5', 'Y-4', 'Y-3', 'Y-2', 'Y-0～Y-1', 'Overseas', '系统'];

    /** EP display labels */
    const EP_LABELS = {
        'Y-7': 'EP Y-7',
        'Y-6': 'EP Y-6',
        'Y-5': 'EP Y-5',
        'Y-4': 'EP Y-4',
        'Y-3': 'EP Y-3',
        'Y-2': 'EP Y-2',
        'Y-0～Y-1': 'EP Y-0～Y-1',
        'Overseas': 'Overseas',
        '系统': 'System',
    };

    /** Build lookup maps */
    const byId = {};
    tracks.forEach(t => { byId[t.id] = t; });

    /**
     * Get audio URL for a track.
     * Priority: direct url > neteaseId construct > null
     */
    function getAudioUrl(track) {
        if (!track) return null;
        // Direct URL (e.g. PRTS wiki)
        if (track.url) return track.url;
        // NetEase Cloud Music external player URL
        if (track.neteaseId) return 'https://music.163.com/song/media/outer/url?id=' + track.neteaseId + '.mp3';
        return null;
    }

    return {
        tracks,
        EP_ORDER,
        EP_LABELS,
        byId,
        getAudioUrl,
        /** Get tracks filtered by EP (null = all) */
        getByEp(ep) {
            if (!ep) return tracks;
            return tracks.filter(t => t.ep === ep);
        },
        /** Search tracks by title (case-insensitive, matches title/titleEn/titleCn) */
        search(query) {
            if (!query || !query.trim()) return tracks;
            const q = query.trim().toLowerCase();
            return tracks.filter(t =>
                (t.title && t.title.toLowerCase().includes(q)) ||
                (t.titleEn && t.titleEn.toLowerCase().includes(q)) ||
                (t.titleCn && t.titleCn.toLowerCase().includes(q))
            );
        },
    };
})();
