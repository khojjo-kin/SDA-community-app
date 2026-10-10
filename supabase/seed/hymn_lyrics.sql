-- Words for hymns 1-695, from the public sda-hymnal dataset (joshpetit/sda-hymnal, "free to use in any capacity").
-- Verses are blocks separated by a blank line; a refrain block starts with "Refrain:".
update public.community_hymns h set lyrics = v.lyrics from (values
(1, 'Praise to the Lord, the Almighty, the King of creation!
O my soul, praise Him, for He is thy health and salvation!
All ye who hear, now to His temple draw near;
Join ye in glad adoration!

Praise to the Lord, Who o''er all things so wondrously reigneth,
Shieldeth thee under His wings, yea, so gently sustaineth!
Hast thou not seen how thy desires e''er have been
Granted in what He ordaineth?

Praise to the Lord, who doth prosper thy work and defend thee;
Surely His goodness and mercy here daily attend thee.
Ponder anew what the Almighty can do,
If with His love He befriend thee.'),
(2, 'All creatures of our God and King,
Lift up your voice with us and sing:
Alleluia! Alleluia!
O burning sun with golden beam
And silver moon with softer gleam:

Refrain:
Oh, praise Him! Oh, praise Him!
Alleluia, alleluia, alleluia!

O rushing wind and breezes soft,
O clouds that ride the winds aloft:
Oh, praise Him! Alleluia!
O rising morn, in praise rejoice,
O lights of evening, find a voice.

O flowing waters, pure and clear,
Make music for your Lord to hear.
Oh praise Him! Alleluia!
O fire so masterful and bright,
Providing us with warmth and light.

Let all things their Creator bless,
And worship him in humbleness,
O praise him Alleluia!
Oh, praise the Father, praise the Son,
And praise the Spirit, three in One!'),
(3, 'God Himself is with us; Let us all adore Him,
And with awe appear before Him.
God is here within us;
Soul, in silence fear Him,Humbly,
fervently draw near Him.
Now His own who have known God,
in worship lowly,Yield their spirits wholly.

Come, abide within me;
Let my soul, like Mary,
Be thine earthly sanctuary,
Come, in-dwelling Spirit,
With transfigured splendour;
Love and honour will I render.
Where I go here below,
Let me bow before Thee.

Gladly we surrender
Earth''s deceitful treasures,
Pride of Life, and sinful pleasures:
Gladly, Lord, we offer Thine to be forever,
Soul and life and each endeavour.
Thou alone shalt be known
Lord of all our being,
Life''s true way declaring.'),
(4, 'Praise, my soul, the King of heaven;
To His feet thy tribute bring.
Ransomed, healed, restored, forgiven,
Who like thee His praise should sing?
Praise Him, praise Him, Alleluia,
Praise the everlasting King.

Praise Him for His grace and favor
To our fathers in distress.
Praise Him, still the same forever,
Slow to chide and swift to bless;
Praise Him, praise Him, Alleluia,
Glorious in His faithfulness.

Tenderly He shields and spares us;
Well our feeble frame He knows.
In His hands He gently bears us,
Rescues us from all our foes.
Praise Him, praise Him, Alleluia,
Widely as His mercy flows.

Angels, help us to adore Him:
Ye behold Him face to face;
Sun and moon, bow down before Him:
Dwellers all in time and space.
Praise Him, praise Him, Alleluia,
Praise with us the God of grace.'),
(5, 'All my hope on God is founded;
He doth still my trust renew,
Me through change and chance He guideth,
Only good and only true.
God unknown, He alone
Calls my heart to be His own.

Pride of man and earthly glory,
Sword and crown betray his trust;
What with care and toil he buildeth,
Tower and temple fall to dust.
But God''s power, hour to hour,
Is my temple and my tower.

God''s great goodness aye endureth,
Deep His wisdom, passing thought:
Splendour, light, and life attend Him,
Beauty springeth out of naught.
Love doth stand at His hand;
Joy doth wait on His command.

Still from man to God eternal
Sacrifice of praise be done,
High above all praises praising
For the gift of Christ His Son.
Christ doth call one and all;
Ye who follow shall not fall.'),
(6, 'O worship the Lord in the beauty of holiness,
Bow down before Him, His glory proclaim;
With gold of obedience, and incense of lowliness,
Kneel and adore Him: the Lord is His name.

Low at His feet lay thy burden of carefulness,
High on His heart He will bear it for thee,
Comfort thy sorrows, and answer thy prayerfulness,
Guiding thy steps as may best for thee be.

Fear not to enter His courts in the slenderness
Of the poor wealth thou wouldst reckon as thine;
Truth in its beauty, and love in its tenderness,
These are the offerings to lay on His shrine.

These, though we bring them in trembling and fearfulness,
He will accept for the name that is dear;
Mornings of joy give for evenings of tearfulness,
Trust for our trembling, and hope for our fear.'),
(7, 'The Lord in Zion reigneth, let all the world rejoice,
And come before His throne of grace with tuneful heart and voice;
The Lord in Zion reigneth, and there His praise shall ring,
To Him shall princes bend the knee and kings their glory bring.

The Lord in Zion reigneth, and who so great as He?
The depths of earth are in His hands; He rules the mighty sea.
O crown His Name with honor, and let His standard wave,
Till distant isles beyond the deep shall own His power to save.

The Lord in Zion reigneth, these hours to Him belong;
O enter now His temple gates, and fill His courts with song;
Beneath His royal banner let every creature fall,
Exalt the King of heaven and earth, and crown Him Lord of all.'),
(8, 'We gather together to ask the Lord''s blessing;
He chastens and hastens His will to make known.
The wicked oppressing now cease from distressing.
Sing praises to His Name; He forgets not His own.

Beside us to guide us, our God with us joining,
Ordaining, maintaining His kingdom divine;
So from the beginning the fight we were winning;
Thou, Lord, were at our side, all glory be Thine!

We all do extol Thee, Thou leader triumphant,
And pray that Thou still our defender wilt be.
Let Thy congregation escape tribulation;
Thy name be ever praised! O Lord, make us free!'),
(9, 'Let all the world in every corner sing,
My God and King!
The heavens are not too high
His praise may thither fly;
The earth is not too low,
His praises there may grow,
Let all the world in every corner sing
My God and King!

Let all the world in every corner sing
My God and King!
The church with psalms must shout
No door can keep them out;
But, above all, the heart
Must bear the longest part
Let all the world in every corner sing
My God and King!'),
(10, 'Come, Christians, join to sing,
Alleluia! Amen!
Loud praise to Christ our King;
Alleluia! Amen!
Let all, with heart and voice,
Before His throne rejoice;
Praise is His gracious choice:
Alleluia! Amen!

Come, lift your hearts on high;
Alleluia! Amen!
Let praises fill the sky;
Alleluia! Amen!
He is our Guide and Friend;
To us He''ll condescend;
His love shall never end:
Alleluia! Amen!

Praise yet our Christ again;
Alleluia! Amen!
Life shall not end the strain;
Alleluia! Amen!
On heaven''s blissful shore
His goodness we''ll adore,
Singing forevermore,
Alleluia! Amen!'),
(11, 'The God of Abraham praise,
Who reigns enthroned above;
Ancient of everlasting days,
And God of love;
Jehovah! Great I AM!
By earth and heaven confessed;
I bow and bless the sacred name,
Forever blest.

The God of Abraham praise,
At whose supreme command
From earth I rise, and seek the joys
At His right hand;
I all on earth forsake,
Its wisdom, fame and power;
And Him my only portion make,
My shield and tower.

The whole triumphant host
Give thanks to God on high;
"Hail, Father, Son, and Holy Ghost!"
They ever cry;
Hail, Abraham''s God and mine!
I join the heavenly lays;
All might and majesty are Thine,
And endless praise.'),
(12, 'Joyful, joyful, we adore Thee,
God of glory, Lord of love;
Hearts unfold like flow''rs before Thee,
Hail Thee as the sun above.
Melt the clouds of sin and sadness,
Drive the dark of doubt away;
Giver of immortal gladness,
Fill us with the light of day!

All Thy works with joy surround Thee,
Earth and heav''n reflect Thy rays,
Stars and angels sing around Thee,
Center of unbroken praise;
Field and forest, vale and mountain,
Bloss''ming meadow, flashing sea,
Chanting bird and flowing fountain
Call us to rejoice in Thee.

Thou art giving and forgiving,
Ever blessing, ever blest,
Wellspring of the joy of living,
Oceandepth of happy rest!
Thou the father, Christ our Brother -
All who live in love are Thine:
Teach us how to love each other,
Lift us to the joy divine.'),
(13, 'New songs of celebration render
To Him who has great wonders done.
Love sits enthroned in ageless splendor:
Come, and adore the mighty One.
He has made known His great salvation
Which all His friends with joy confess:
He has revealed to every nation
His everlasting righteousness.

Joyfully, heartily resounding,
Let every instrument and voice
Peal out the praise of grace abounding
Calling the whole world to rejoice.
Trumpets and organs, set in motion
Such sounds as make the heavens ring;
All things that live in earth and ocean,
Make music for your mighty King.

Rivers and seas and torrents roaring,
Honor the Lord with wild acclaim;
Mountains and stones look up adoring,
And find a voice to praise His name.
Righteous, commanding, ever glorious,
Praises be His that never cease:
Just is our God, whose truth victorious,
Establishes the world in peace.'),
(14, 'Let us praise the name of the Lord!
Give Him glory, Amen.

Go ye into all the world.
Alleluia, Amen.

Amen, amen,
Amen, amen.'),
(15, 'My Maker and my King,
To Thee my all I owe;
Thy sovereign bounty is the spring
Whence all my blessings flow;
Thy sovereign bounty is the spring
Whence all my blessings flow.

The creature of Thy hand,
On Thee alone I live;
My God, Thy benefits demand
More praise than I can give.
My God, Thy benefits demand
More praise than I can give.

Lord, what can I impart
When all is Thine before?
Thy love demands a thankful heart;
The gift, alas! how poor.
Thy love demands a thankful heart;
The gift, alas! how poor.

O! let Thy grace inspire
My soul with strength divine;
Let every word each desire
And all my days be Thine.
Let every word each desire
And all my days be Thine.'),
(16, 'All people that on earth do dwell,
sing to the Lord with cheerful voice.
Him serve with mirth, his praise forth tell;
come ye before him and rejoice.

Know that the Lord is God indeed;
without our aid he did us make;
we are his folk, he doth us feed,
and for his sheep he doth us take.

O enter then his gates with praise;
approach with joy his courts unto;
praise, laud, and bless his name always,
for it is seemly so to do.

For why! the Lord our God is good;
his mercy is forever sure;
his truth at all times firmly stood,
and shall from age to age endure.'),
(17, 'Lord of all being, throned afar,
Thy glory flames from sun and star;
Center and soul of every sphere
Yet to each loving heart how near!
Yet to each loving heart how near!

Sun of our life, Thy quickening ray
Shed on our path the glow of day;
Star of our hope, Thy softened light
Cheers the long watches of the night,
Cheers the long watches of the night.

Our midnight is Thy smile withdrawn;
Our noontide is Thy gracious dawn;
Our rainbow arch, Thy mercy''s sign;
All, save the clouds of sin, are Thine,
All, save the clouds of sin, are Thine.

Lord of all life, below, above
Whose light is truth, whose warmth is love,
Before Thy ever-blazing throne
We ask no luster of our own,
We ask no luster of our own.

Grant us Thy truth to make us free
And kindling hearts that burn for Thee;
Till all Thy living altars claim
One holy light, one heavenly flame!
One holy light, one heavenly flame.'),
(18, 'O Morning Star, how fair and bright!
You shine with God''s own truth and light,
Aglow with grace and mercy!
Of Jacob''s race, King David''s son,
Our Lord and Master, You have won
Our hearts to serve You only!
Lowly, holy!
Great and Glorious, all victorious,
Rich in blessing! Rule and might o''er all possessing!

Lord, when you look on us in love,
At once there falls from God above
A ray of purest pleasure.
Your Word and Spirit, flesh and blood,
Refresh our souls with heav-''nly food.
You are our dearest treasure!
Let Your mercy warm and cheer us!
O draw near us! For You teach us
God''s own love through You has reached us.

Almighty Father, in Your Son
You loved us, when not yet begun
Was this old earth''s foundation!
Your Son has ransomed us in love
To live in Him here and above:
This is Your great salvation.
Alleluia! Christ the living,
To us giving life forever,
Keeps us Yours and fails us never!

O let the harps break forth in sound!
Our joy be all with music crowned,
Our voices gaily blending!
For Christ goes with us all the way ''
Today, tomorrow, every day!
His love is never ending!
Sing out! Ring out!
Jubilation! Exultation!
Tell the story!
Great is He, the King of glory!'),
(19, 'O sing a new song to the Lord
For marvels He has done;
His right hand and His holy arm
The victory have won.

With harp, and voice of psalms
Unto Jehovah sing;
Let trumpets and the echoing horn
Acclaim the Lord our King!

Let seas with all their creatures roar,
The world and dwellers there,
And let the rivers clap their hands,
The hills their joy declare.

Before the Lord: because He comes,
To judge the earth come He;
He''ll judge the world
with righteousness,
His folk with equity.'),
(20, 'O praise ye the Lord!
Praise Him in the height;
Rejoice in His word,
Ye angels of light;
Ye heavens, adore Him
By whom ye were made,
And worship before Him,
In brightness arrayed.

O praise ye the Lord!
Praise Him upon earth,
In tuneful accord:
Ye sons of new birth;
Praise Him who hath brought
you His grace from above,
Praise Him who hath taught
you To sing of His love.

O praise ye the Lord,
All things that give sound;
Each jubilant chord,
Re-echo around;
Loud organs His glory
Forth tell in deep tone,
And sweet harp, the story
Of what He hath done.

O praise ye the Lord!
Thanksgiving and song
To Him be outpoured
All ages along:
For love in creation,
For heaven restored.
For grace of salvation,
O praise ye the Lord!'),
(21, 'Immortal, invisible, God only wise,
In light inaccessible hid from our eyes,
Most blessed, most glorious, the Ancient of Days,
Almighty, victorious, Thy great Name we praise.

Unresting, unhasting, and silent as light,
Nor wanting, nor wasting, Thou rulest in might;
Thy justice, like mountains, high soaring above
Thy clouds, which are fountains of goodness and love.

To all, life Thou givest, to both great and small;
In all life Thou livest, the true life of all;
We blossom and flourish as leaves on the tree,
And wither and perish - but naught changeth Thee.

Great Father of glory, pure Father of light,
Thine angels adore Thee, all veiling their sight;
All praise we would render; O help us to see
''Tis only the splendor of light hideth Thee!'),
(22, 'God is our Song, and every singer blest
Who praising Him finds energy and rest.
All who praise God with unaffected joy
Give back to us the widom we destroy,
Give back to us the widom we destroy.

God is our Song, for Jesus comes to save;
While praising Him we offer all we have.
New songs we sing, in ventures new unite,
When Jesus leads us upward into light,
When Jesus leads us upward into light.

This is our Song no conflict ever drowns;
Who praises God our human wrath disowns.
Love knows what rich complexities of sound
God builds upon a simple common ground,
God builds upon a simple common ground.

God is our Silence when no songs are sung,
When ecstasy or sorrow stills the tongue.
Glorious the faith which silently obeys
Until we find again the voice of praise,
Until we find again the voice of praise.'),
(23, 'Now the joyful bells a-ringing,
All ye mountains, praise the Lord!
Lift our hearts like birds a winging,
All ye mountains, praise the Lord!
Now our festal season bringing
Kinsmen all to bide and board,
Sets our cheery voices singing:
All ye mountains, praise the Lord!

Dear our home as dear none other;
Where the mountains praise the Lord!
Gladly here our care we smother;
Where the mountains praise the Lord!
Here we know that Christ our brother
Binds us all as by a cord:
He was born of Mary mother
Where the mountains praise the Lord!

Cold the year, new whiteness wearing,
All ye mountains, praise the Lord!
Peace, good will to us abearing,
All ye mountains praise the Lord!
Now we all God''s goodness sharing
Break the bread and sheath the sword:
Bright our hearts the signal flaring,
All ye mountains, praise the Lord!'),
(24, 'Every star shall sing a carol;
Every creatures, high or low,
Come and praise the King of heaven
By whatever name you know.

Refrain:
God above, Man below,
Holy is the name I know.

When the King of all creation
Had a cradle on the earth,
Holy was the human body,
Holy was the human birth.

Every star and every planet,
Every creature, high or low,
Come and praise the King of heaven
By whatever name you know.'),
(25, 'Praise the Lord, His glories show, Alleluia!
Saints within His courts below, Alleluia!
Angels ''round His throne above, Alleluia!
All that see and share His love, Alleluia!

Earth to heaven and heaven to earth, Alleluia!
Tell His wonders, sing His worth, Alleluia!
Age to age and shore to shore, Alleluia!
Praise Him, praise Him evermore! Alleluia!

Praise the Lord, His mercies trace, Alleluia!
Praise His providence and grace, Alleluia!
All that He for man hath done, Alleluia!
All He sends us through His Son. Alleluia!'),
(26, 'Praise the Lord: you heavens, adore Him;
Praise Him, angels in the height;
Sun and moon, rejoice before Him;
praise Him, all you stars of light.
Praise the Lord, for He has spoken;
worlds His mighty voice obeyed.
Laws which never shall be broken
for their guidance He has made.

Praise the Lord! for He is glorious;
never shall His promise fail.
God has made His saints victorious;
sin and death shall not prevail.
Praise the God of our salvation!
hosts on high, His power proclaim.
Heaven and earth and all creation,
laud and magnify His Name.

Worship, honor, glory, blessing,
Lord, we offer as our gift.
Young and old, Your praise expressing,
Our glad songs to You we lift.
All the saints in heaven adore You;
we would join their glad acclaim;
As Your angels serve before You,
so on earth we praise Your name.'),
(27, 'Rejoice ye pure in heart!
Rejoice, give thanks, and sing;
Your festal banner wave on high,
The cross of Christ your King.

Refrain:
Rejoice, rejoice, rejoice,
Give thanks and sing.

With voice as full and strong
As ocean''s surging praise,
Send forth the sturdy hymns of old,
The psalms of ancient days.

With all the angel choirs,
With all the saints of earth,
Pour out the strains of joy and bliss,
True rapture, noblest mirth.

Yes, on through life''s long path,
Still chanting as ye go;
From youth to age, by night and day,
In gladness and in woe.

Praise Him who reigns on high,
The Lord whom we adore,
The Father, Son and Holy Ghost,
One God forever more.'),
(28, 'Praise we the Lord, who made all beauty
For all our senses to enjoy;
Owe we our humble thanks and duty
That simple pleasures never cloy;
Praise we the Lord, who made all beauty
For all our senses to enjoy.

Praise Him who loves to see young lovers,
Fresh hearts that swell with youthful pride;
Thank Him who sends the sun above us,
As bridegroom fit to meet his bride;
Praise Him who loves to see young lovers,
Fresh hearts that swell with youthful pride.

Praise Him who by a simple flower
Lifts up our hearts to things above;
Thank Him who gives to each one power
To find a friend to know and love;
Praise Him who by a simple flower
Lifts up our hearts to things above.'),
(29, 'Sing praise to God who reigns above,
the God of all creation,
the God of power, the God of love,
the God of our salvation.
With healing balm my soul He fills,
and every faithless murmur stills;
To God all praise and glory!

What God''s almighty power hath made
His gracious mercy keepeth;
By morning glow or evening shade,
His watchful eye ne''er sleepeth,
Within the kingdom of his might,
Lo! all is just, and all is right:
To God all praise and glory!

The Lord is never far away,
throughout all grief distressing,
an ever present help and stay,
our peace and joy and blessing.
As with a mother''s tender hand,
He leads His own, His chosen band:
To God all praise and glory!

Then all my gladsome way along,
I sing aloud thy praises,
that men may hear the grateful song
my voice unwearied raises:
Be joyful in the Lord, my heart!
both soul and body bear your part!
To God all praise and glory.'),
(30, 'Holy God, we praise Your name;
Lord of all, we bow before You!
All on earth Your scepter claim,
All in heaven above adore You;
Infinite Your vast domain.
Everlasting is Your reign.

Hark! the loud celestial hymn
Angel choirs above are raising,
Cherubim and seraphim,
In unceasing chorus praising;
Fill the heavens with sweet accord:
Holy, holy, holy, Lord.

Holy Father, Holy Son,
Holy Spirit, three we name You;
While in essence only one,
Undivided God we claim You;
And adoring bend the knee,
While we own the mystery.'),
(31, 'Tell out, my soul, the greatness of the Lord:
Unnumbered blessings give my spirit voice;
Tender to me the promise of His word;
In God my Savior shall my heart rejoice.

Tell out, my soul, the greatness of His name:
Make known His might, the deeds His arm has done;
His mercy sure, from age to age the same;
His holy name, the Lord, the Mighty One.

Tell out, my soul, the greatness of His might:
Pow''rs and dominions lay their glory by;
Proud hearts and stubborn wills are put to flight,
The hungry fed, the humble lifted high.

Tell out, my soul, the glories of His word:
Firm is His promise, and His mercy sure.
Tell out, my soul, the greatness of the Lord
To children''s children and forever more.'),
(32, 'When in our music God is glorified,
And adoration leaves no room for pride,
It is as though the whole creation cried:
Alleluia! Alleluia!

How oft, in making music, we have found
A new dimension in the world of sound,
As worship moved us to a more profound
Alleluia! Alleluia!

And did not Jesus sing a psalm that night
When utmost evil strove against the light?
Then let us sing for whom He won the fight:
Alleluia! Alleluia!

Let every instrument be used for praise;
Let all rejoice who have a voice to raise;
And may God give us faith to sing always:
Alleluia! Alleluia!'),
(33, 'Sing a new song to the Lord,
He to whom wonders belong.
Rejoice in His triumph and tell of His power.
O sing a new song to the Lord.

Now to the ends of the earth
See His salvation is shown.
And still He remembers His mercy and truth,
Unchanging in love to His own.

Sing a new song and rejoice.
Publish His praises abroad.
Let voices in chorus with trumpet and horn,
Resound for the joy of the Lord.

Join with the hills and the sea,
Thunders of praise to prolong.
In judgment and justice
He comes to the earth.
O sing a new song to the Lord.'),
(34, 'Wake the song of joy and gladness;
Hither bring your noblest lays;
Bannish every thought of sadness,
Pouring forth your highest praise.
Sing to Him whose care has brought us
Once again with friends to meet,
And whose loving voice has taught us
Of the way to Jesus'' feet.

Refrain:
Wake the song, wake the song,
The song of joy and gladness,
Wake the song, wake the song,
The song of Jubilee.

Joyfully with songs and banners,
We will greet the festal day;
Shout aloud our glad hosannas,
And our grateful homage pay.
We will chant our Savior''s glory
while our thoughts we raise above,
Telling still the old, old, story,
Precious theme- redeeming love!

Thanks to Thee, O holy Father,
For the mercies of the year;
May each heart, as here we gather,
Swell with gratitude sincere,
Thanks to Thee, O loving Savior,
For redemption through Thy blood.
Breathe upon us, Holy Spirit,
Sweetly draw us near to God.'),
(35, 'With songs and honors sounding loud,
Address the Lord on high;
Over the heavens He spreads His cloud,
And waters veil the sky.

He sends His showers of blessing down
To cheer the plains below;
He makes the grass the mountains crown,
And corning valleys grow.

His steady counsels change the face
Of the declining year;
He bids the sun cut short his race,
And wintry days appear.

He sends His word, and melts the snow;
The fields no longer mourn;
He calls the warmer gales to blow,
And bids the spring return.

The changing wind, the flying cloud,
Obey His mighty word:
With songs and honors sounding loud
Praise ye the sovereign Lord!'),
(36, 'O Thou in whose presence my soul takes delight,
On whom in affliction I call,
My comfort by day and my song in the night,
My hope, my salvation, my all!

His voice, as the sound of the dulcimer sweet,
Is heard through the shadows of death;
The cedars of Lebanon bow at His feet,
The air is perfumed with His breath.

His lips, as a fountain of righteousness flow,
To water the gardens of grace;
From which their salvation the Gentiles shall know,
And bask in the smiles of His face.

He looks, and ten thousands of angels rejoice,
And myriads wait for His word;
He speaks, and eternity, filled with His voice,
Re-echoes the praise of the Lord.'),
(37, 'O sing my soul, your Maker''s praise
In grateful hymns ascending;
Whose steadfast love has crowned your days
With heav''nly gifts un ending.
I sought the Lord, He heard my cry;
His holy angels hover nigh
The tents of those who love Him.

The Lord is good to those who seek
His face in time of sorrow,
Providing comfort to the weak
And grace for each tomorrow.
Though grief may tarry for a night,
The morn shall break in joy and light
With blessings from His presence.

The Lord will turn His face in peace
When troubled souls draw near Him;
His loving kindness shall not cease
To those who trust and fear Him.
Our God will not forsake His own;
Eternal is His heav''nly throne;
His kingdom stands forever.'),
(38, 'Arise, my soul, arise! Stretch forth to things eternal
And hasten to the feet of your Redeemer God.
Though hid from mortal eyes,
He dwells in light supernal;
Yet worship Him in humbleness and call Him Lord.
His banquet of love Awaits you above;
Yet here He grants a foretaste of the feast to
the feast to come! Rejoice, my soul, rejoice,
To heav''n lift up your voice:
Alleluia, alleluia, alleluia!

Now hear the harps of heav''n!
Oh, hear the song victorious,
The neverending anthem sounding through the sky!
To mortals is not giv''n To join in strains so glorious;
Yet here on earth we too can sing our praises high!
He bought with His blood The ransomed of God;
To Him be ever lasting pow''r and victory.
And let the great amenResound through heav''n again.
Alleluia, alleluia, alleluia!'),
(39, 'Lord, in the morning Thou shalt hear
My voice ascending high;
To Thee will I direct my prayer,
To Thee lift up mine eye-

Up to the hills where Christ is gone
To plead for all His saints,
Presenting at His Father''s throne
Our songs and our complaints.

O may Thy Spirit guide my feet
In ways of righteousness;
Make every path of duty straight
And plain before my face.

The men that love and fear Thy name
Shall see their hopes fulfilled;
The mighty God will compass them
With favor as a shield.'),
(40, 'The dawn of God''s dear Sabbath
Breaks o''er the earth again,
As some sweet summer morning
After a night of pain;
It comes as cooling showers
To some exhausted land,
As shade of clustered palm trees
''Mid weary wastes of sand.

Lord, we would bring for offering,
Though marred with earthly soil,
A week of earnest labor,
Of steady, faithful toil,
Fair fruits of self denial,
Of strong, deep love to Thee,
Fostered by Thine own Spirit,
In true humility.

And we would bring our burden
Of sinful thought and deed,
In Thy pure presence kneeling,
From bondage to be freed,
Our heart''s most bitter sorrow
For all Thy work undone-
So many talents wasted!
So few bright laurels won!

And with that sorrow mingling,
A steadfast faith, and sure,
And love so deep and fervent,
For Thee to make it pure,
In Thy dear presence finding
The pardon that we need,
And then the peace so lasting-
Celestial peace indeed.'),
(41, 'O splendor of God''s glory bright,
From light eternal bringing light;
O Light of life, light''s living spring,
True day, all days illumining.

O Thou true Sun, on us Thy glance
Let fall in royal radiance;
The Spirit''s sanctifying beam
Upon our earthly senses stream.

O joyful be the passing day
With thoughts as clear as morning''s ray,
With faith like noontide shining bright,
Our souls unshadowed by the night.

Dawn''s glory gilds the earth and skies;
Let Him, our perfect morn, arise;
The Father''s help His children claim,
And sing the Father''s glorious name. Amen.'),
(42, 'Now that the daylight fills the sky,
We lift our hearts to God on high,
That He, in all we do or say,
Would keep us free from harm today;

Would guard our hearts and tongues from strife;
From anger''s din would shield our life;
From evil sights would turn our eyes,
And close our ears to vanities;

So we, when this new day is gone
And night in turn is drawing on,
With conscience by the world unstained
Shall praise His name for vict''ry gained.

"All praise to You, creator Lord!
All praise to You, eternal Word!
All praise to You, O Spirit wise!"
We sing as daylight fills the skies.'),
(43, 'When morning gilds the skies my heart awaking cries,
May Jesus Christ be praised!
Alike at work and prayer, to Jesus I repair:
May Jesus Christ be praised!

Whene''er the sweet church bell peals over hill and dell,
May Jesus Christ praised!
O hark to what it sings, as joyously it rings,
May Jesus Christ be praised!

The night becomes as day when from the heart we say:
May Jesus Christ be praised!
The powers of darkness fear when this sweet chant they hear:
May Jesus Christ be praised!

Ye nations of mankind, in this your concord find,
May Jesus Christ praised!
Let all the earth around ring joyous with the sound,
May Jesus Christ praised!

In heaven''s eternal bliss the loveliest strain is this,
May Jesus Christ praised!
Let earth, and sea and sky from depth to height reply,
May Jesus Christ praised!

Be this, while life is mine, my canticle divine:
May Jesus Christ be praised!
Be this th''eternal song through all the ages long,
May Jesus Christ be praised!'),
(44, 'Morning has broken like the first morning,
Blackbird has spoken like the first bird.
Praise for the singing!Praise for the morning!
Praise for the springing fresh from the Word!

Sweet the rain''s new fall sunlit from heaven,
Like the first dewfall on the first grass.
Praise for the sweetness of the wet garden,
Sprung in completeness where His feet pass.

Mine is the sunlight! Mine is the morning
Born of the one light Eden saw play!
Praise with elation, Praise every morning,
God''s recreation of the new day!'),
(45, 'Open now thy gates of beauty,
Zion, let me enter there,
Where my soul in joyful duty
Waits for God Who answers prayer.
Oh, how bless''d is this place,
Filled with solace, light, and grace!

Gracious God, I come before Thee,
Come Thou also unto me;
Where we find Thee and adore Thee,
There a heav''n on earth must be.
To my heart, oh, enter Thou,
Let it be Thy temple now!

Here Thy praise is gladly chanted,
Here Thy seed is duly sown;
Let my soul, where it is planted,
Bring forth precious sheaves alone,
So that all I hear may be
Fruitful unto life in me.

Thou my faith increase and quicken,
Let me keep Thy gift divine,
Howsoe''er temptations thicken;
May Thy Word still o''er me shine
As my guiding star through life,
As my comfort in my strife.

Speak, O God, and I will hear Thee,
Let Thy will be done indeed;
May I undisturbed draw near Thee
While Thou dost Thy people feed.
Here of life the fountain flows;
Here is balm for all our woes.'),
(46, 'Abide with me, ''tis eventide!
The day is past and gone;
The shadows of the evening fall;
The night is coming on!
Within my heart a welcome guest,
Within my home abide;

Refrain:
O Savior, stay this night with me;
Behold, ''tis eventide!
O Savior, stay this night with me;
Behold, ''tis eventide.

Abide with me, ''tis eventide!
Thy walk today with me
Has made my heart within me burn,
As I communed with Thee.
Thy earnest words have filled my soul
And kept me near Thy side;

Abide with me, ''tis eventide!
And lone will be the night,
If I cannot commune with Thee,
Nor find in Thee my light.
The darkness of the world, I fear,
Would in my home abide;'),
(47, 'God, who made the earth and heaven, Darkness and light:
You the day for work have given, For rest the night.
May Your angel guards defend us,
Slumber sweet Your mercy send us,
Holy dreams and hopes attend us
All through the night.

And when morn again shall call us to run life''s way,
May we still, what-e''er befall us, Your will obey.
From the pow''r of evil hide us,
In the narrow pathway guide us,
Never be Your smile denied us
All through the day.

Guard us waking, guard us sleeping, And, when we die,
May we in Your mighty keeping All peaceful lie.
When the trumpet call shall wake us, Then,
O Lord, do not forsake us,
But to reign in glory take us with You on high.

Holy Father, throned in heaven, All holy Son,
Holy Spirit, freely given, Blest Three in One:
Grant us grace, we now implore You,
Till we lay our crowns before You
And in worthier strains adore You while ages run.'),
(48, 'Softly now the light of day
Fades upon out sight away:
Free from care, from labor free,
Lord, we would commune with Thee.

Thou, whose allpervading eye
Nought escapes, without, within,
Pardon each infirmity,
Open fault, and secret sin.

Soon from us the light of day
Shall forever pass away;
Then, from sin and sorrow free,
Take us, Lord, to dwell with Thee.'),
(49, 'Savior, breathe an evening blessing,
Ere repose our spirits seal;
Sin and want we come confessing;
Thou canst save, and Thou canst heal.

Though the night be dark and dreary,
Darkness cannot hide from Thee;
Thou art He who, never weary,
Watchest where Thy people be.

Though destruction walk around us.
Though the arrow past us fly,
Angel guards from Thee Surround us,
We are safe if Thou art nigh.

Should swift death this night o''re-take us,
And our couch become our tomb,
May the morn of glory wake us,
Clad in light and deathless bloom.'),
(50, 'Abide with me; fast falls the eventide;
The darkness deepens; Lord with me abide!
When other helpers fail and comforts flee,
Help of the helpless, O abide with me.

Swift to its close ebbs out life''s little day;
Earth''s joys grow dim; its glories pass away;
Change and decay in all around I see;
O Thou who changest not, abide with me.

I need Thy presence every passing hour.
What but Thy grace can foil the tempter''s power?
Who, like Thyself, my guide and stay can be?
Through cloud and sunshine, Lord, abide with me.

I fear no foe, with Thee at hand to bless;
Ills have no weight, and tears no bitterness.
Where is death''s sting? Where, grave, thy victory?
I triumph still, if Thou abide with me!'),
(51, 'Day is dying in the west;
Heaven is touching earth with rest;
Wait and worship while the night
Sets the evening lamps alight
Through all the sky.

Refrain:
Holy, holy, holy, Lord God of Hosts!
Heaven and earth are full of Thee!
Heaven and earth are praising Thee,
O Lord most high!

Lord of life, beneath the dome
Of the universe, Thy home,
Gather us who seek Thy face
To the fold of Thy embrace,
For Thou art nigh.

While the deepening shadows fall,
Heart of love enfolding all,
Through the glory and the grace
Of the stars that veil Thy face,
Our hearts ascend.

When forever from our sight
Pass the stars, the day, the night,
Lord of angels, on our eyes
Let eternal morning rise
And shadows end.'),
(52, 'Now the day is over,
night is drawing nigh,
Shadows of the evening
steal across the sky.

Father, give the weary,
calm and sweet repose;
With Thy tenderest blessing
May our eyelids close.

Through the long night watches,
may thine angels spread
Their white wings above me,
watching round my bed.'),
(53, 'All praise to thee, my God, this night,
for all the blessings of the light!
Keep me, O keep me, King of kings,
beneath thine own almighty wings.

Forgive me, Lord, for thy dear Son,
the ill that I this day have done,
that with the world, myself, and thee,
I, ere I sleep, at peace may be.

O may my soul on thee repose,
and with sweet sleep mine eyelids close,
sleep that may me more vigorous make
to serve my God when I awake.

Praise God, from whom all blessings flow;
praise him, all creatures here below;
praise him above, ye heavenly host;
praise Father, Son, and Holy Ghost.'),
(54, 'O gladsome light, O grace
Of God the Father''s face,
The eternal splendor wearing;
Celestial, holy, blest,
Our Savior, Jesus Christ,
Joyful in Thine appearing.

Now e''er day fadeth quite,
We see the ev''ning light,
Our wonted hymn ourpouring;
Father of might unknown,
Thee His incarnate Son,
And Holy Spirit adoring.

To Thee of right belongs
All praise of holy songs,
O Son of God, life giver;
Thee therefore, O most high,
The world doth glorify
And shall exalt for ever.'),
(55, 'Jesus, tender Shepherd, hear me,
Bless Thy little lamb tonight;
Through the darkness be Thou near me;
Watch my sleep till morning light.

All this day Thy hand has led me,
And I thank Thee for Thy care;
Thou hast clothed me, warmed and fed me;
Listen to my evening prayer.'),
(56, 'The day Thou gavest, Lord, is ended;
the darkness falls at Thy behest;
to Thee our morning hymns ascended;
Thy praise shall hallow now our rest.

We thank Thee that Thy church, unsleeping
while earth rolls onward into light,
through all the world her watch is keeping,
and rests not now by day or night.

As o''er each continent and island
the dawn leads on another day,
the voice of prayer is never silent,
nor die the strains of praise away.

So be it, Lord; Thy throne shall never,
like earth''s proud empires, pass away.
Thy kingdom stands, and grows forever,
till all Thy creatures own Thy sway.'),
(57, 'Now all the woods are sleeping,
And night and stillness creeping
O''er city, man, and beast;
But thou, my heart, awake thee,
To pray''r awhile be take thee,
And praise thy Maker ere thou rest.

My Jesus, stay Thou by me,
And let no foe come nigh me,
Safe sheltered by Thy wing;
But would the foe alarm me,
O let him never harm me,
But still Thine angels round me sing!

My loved ones, rest securely,
From every peril surely
Our God will guard your heads;
And happy slumbers send you,
And bid His hosts attend you,
And golden armed watch o''er your beds.'),
(58, 'Hark! the vesper hymn is stealing
O''er the waters soft and clear;
Jubilate, Jubilate, Jubilate, Amen.

Nearer yet, and nearer pealing,
Soft it breaks upon the ear.
Jubilate, Jubilate, Jubilate, Amen.'),
(59, 'Great our joy as now we gather
Where the Master makes us one:
Where we worship God the Father
Thro'' the Spirit of His Son.
All who search for His church
Find it where His will is done.

Precious is the tie that binds us
To our God when faith grows cold;
Precious all that now reminds us
He is still our safe stronghold.
Faithful love serves to prove
Here the Shepherd has His fold.

May we learn from Christ''s example
How to use this house of prayer:
He who loved and cleansed His temple
Wants us all to worship there.
God the Son shuts out none:
In His Kingdom all may share.

Lord, inspire us with Your vision
Of a world which must be won!
Glorious is the church''s mission,
Long endeavored, scarce begun!
Faithful now- this is how
God''s eternal will is done.'),
(60, 'Blessed Jesus, at Thy word,
We have gathered all to hear Thee;
By Thy word our hearts were stirred,
Now to seek and love and fear Thee.
By Thy teachings sweet and holy,
Let us learn to love Thee solely.

All our knowledge, sense, and sight,
Lie in deepest darkness shrouded;
Till Thy Spirit breaks our night,
With His beams of truth unclouded.
He alone to God canst win us,
He who works all good within us.

Glorious Lord, Thy self impart!
Light of light, from God proceeding.
Open Thou our ears and heart
Help us, by Thy Spirit''s pleading.
Hear the cry Thy people raises!
Hear, and bless our prayer and praises!'),
(61, 'God is here as we his people
meet to offer praise and prayer,
may we find in fuller measure
what it is in Christ we share.
Here, as in the world around us,
all our varied skills and arts
wait the coming of his Spirit
into open minds and hearts.

Here are symbols to remind us
of our lifelong need of grace;
here are table, font and pulpit;
here the Word has central place.
Here in honesty of preaching,
here in silence, as in speech,
here in newness and renewal,
God the Spirit comes to each.

Here our children find a welcome
in the Shepherd''s flock and fold.
Here, as bread and wine are taken,
Christ sustains us, as of old.
Here the servants of the Servant
seek in worship to explore
what it means in daily living
to believe and to adore.

Lord of all, Church and Kingdom,
in an age of change and doubt,
keep us faithful to the Gospel,
help us work your purpose out.
Here, in this day''s dedication,
all we have to give, receive:
we, who cannot live without you,
we adore you! We believe!'),
(62, 'How lovely is Thy dwelling place,
O Lord of hosts to me!
The tabenacles of Thy grace
How pleasant, Lord, they be!

My thirsty soul longs ardently,
Yea, faints Thy courts to see;
My very heart and flesh cry out,
O living God, for Thee.

Behold the sparrow findeth out
A house where-in to rest;
The swallow also, for herself
Provided hath a nest.

Ev''n Thine own altars, where she safe
Her young ones forth may bring,
O Thou, almighty Lord of hosts,
Who art my God and King.

Blest are they in Thy house that dwell,
They ever give Thee praise.
Blest is the man whose strength Thou art,
In whose heart are Thy ways.'),
(63, 'O come, let us sing to the Lord,
Come let us every one
A joyful noise make to the Rock
Of our salvation.

Let us before His presence come
With glad and thankful voice;
Let us sing psalms of praise to Him,
And make a joyful noise.

For God, a great God and great King,
Above all gods, He is;
The depths of earth are in His hand,
The strength of hills is His.

To Him the ocean vast belongs,
For He the sea did make;
The dry land also from His hands,
Its form at first did take.

O come, bow down and worship Him,
And kneeling, humbly pray,
Come to our Maker and our God,
And hear His voice today.'),
(64, 'Lord, dismiss us with thy blessing;
fill our hearts with joy and peace;
let us each, thy love possessing,
triumph in redeeming grace.
O refresh us, O refresh us,
traveling through this wilderness.

Thanks we give and adoration
for thy gospel''s joyful sound.
May the fruits of thy salvation
in our hearts and lives abound;
ever faithful, ever faithful
to the truth may we be found.'),
(65, 'God be with you till we meet again;
By His counsels guide, uphold you,
With His sheep securely fold you;
God be with you till we meet again.

Refrain:
Till we meet, till we meet,
Till we meet at Jesus'' feet;
Till we meet, till we meet,
God be with you till we meet again.

God be with you till we meet again;
''Neath His wings securely hide you;
Daily manna still provide you;
God be with you till we meet again.

God be with you till we meet again;
When life''s perils thick confound you;
Put His arms unfailing round you;
God be with you till we meet again.

God be with you till we meet again;
Keep love''s banner floating over you,
Strike death''s threatening wave before you;
God be with you till we meet again.'),
(66, 'God be with you till we meet again;
By His counsels guide, uphold you,
With His sheep securely fold you:
God be with you till we meet again.

God be with you till we meet again;
Neath His wings securely hide you,
Daily manna still provide you:
God be with you till we meet again.

God be with you till we meet again;
When life''s perils thick confound you,
Put His arms unfailing round you:
God be with you till we meet again.

God be with you till we meet again;
Keep love''s banner floating o''er you,
Smite death''s threatening wave before you:
God be with you till we meet again.'),
(67, 'O Lord, now let Your servant
Depart in heav''nly peace,
For I have seen the glory
Of Your redeeming grace:
A light to lead the Gentiles
Unto Your holy hill,
The glory of Your people,
Your chosen Israel.

Then grant that I may follow Your gleam,
O glorious Light,
Till earthly shadows scatter,
And faith is changed to sight;
Till raptured saints shall gather
Upon that shining shore,
Where Christ, the blessed Day star,
Shall light them evermore.'),
(68, 'On our way rejoicing
Gladly let us go;
Conquer''d hath our Leader,
Vanquish''d is the foe.
Christ without, our safety;
Christ within, our joy;
Who, if we be faithful,
Can our hope destroy?

Refrain:
On our way rejoicing
As we forward move,
Hearken to our praises,
O blest God of love!

Unto God the Father
Joyful songs we sing,
Unto God the Savior
Thankful hearts we bring,
Unto God the Spirit
Bow we and adore,
On our way rejoicing
Now and evermore.'),
(69, 'Lord, make us more holy;
Lord, make us more holy;
Lord, make us more holy
Until we meet again.

Lord, make us more faithful;
Lord, make us more faithful;
Lord, make us more faithful
Until we meet again.

Lord, make us more humble;
Lord, make us more humble;
Lord, make us more humble
Until we meet again.

Lord, make us more loving;
Lord, make us more loving;
Lord, make us more loving
Until we meet again.
Like Jesus, the Savior,
Until we meet again.'),
(70, 'Praise ye the Father for His loving kindness,
Tenderly cares He for His erring children;
Praise Him, ye angels, praise Him in the heavens;
Praise ye Jehovah!

Praise ye the Savior, great is the compassion,
Graciously cares He for His chosen people;
Young men and maidens, ye old men and children,
Praise ye the Savior!

Praise ye the Spirit, comforter of Israel,
Sent of the Father and the Son to bless us;
Praise ye the Father, Son, and Holy Spirit,
Praise the Eternal Three!')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(71, 'Come, Thou almighty King,
Help us Thy name to sing,
Help us to praise!
Father all glorious,
O''er all victorious,
Come, and reign over us,
Ancient of Days!

Come, Thou incarnate Word,
Gird on Thy mighty sword,
Our prayer attend;
Come, and Thy people bless,
And give Thy Word success;
Spirit of holiness,
On us descend!

Come, holy Comforter,
Thy sacred witness bear,
In this glad hour:
Thou who almighty art,
Now rule in every heart,
And ne''er from us depart,
Spirit of power!

To Thee, great One in Three,
Eternal praises be,
Hence, evermore:
Thy sovereign majesty
May we in glory see,
And to eternity
Love and adore!'),
(72, 'Creator of the stars of night,
Thy people''s ever lasting light,
O Christ, Thou Savior of us all,
We pray Thee, hear us when we call.

At the great name of Jesus, now
All knees must bend, all hearts must bow;
And things celestial Thee shall own,
And things terrestial, Lord alone.

To God the Father, God the Son,
And God the Spirit, Three in one,
Laud, honor, might, and glory be
From age to age eternally. Amen.'),
(73, 'Holy, holy, holy! Lord God Almighty!
Early in the morning our song shall rise to Thee;
Holy, holy, holy, merciful and mighty!
God in three Persons, blessed Trinity!

Holy, holy, holy! Angels adore Thee,
Casting down their golden crowns around the glassy sea;
Thousands and ten thousands worship low before Thee,
Which wert, and art, and evermore shalt be.

Holy, holy, holy! though the darkness hide Thee,
Though the eye of sinful man Thy glory may not see;
Only Thou art holy; there is none beside Thee,
Perfect in power, in love, and purity.

Holy, holy, holy! Lord God Almighty!
All Thy works shall praise Thy name, in earth, and sky, and sea;
Holy, holy, holy; merciful and mighty!
God in three Persons, blessed Trinity!'),
(74, 'Like a river glorious, is God''s perfect peace,
Over all victorious, in its bright increase;
Perfect, yet it floweth, fuller every day,
Perfect, yet it groweth, deeper all the way.

Refrain:
Stayed upon Jehovah, hearts are fully blessed
Finding, as He promised, perfect peace and rest.

Hidden in the hollow of His blessed hand,
Never foe can follow, never traitor stand;
Not a surge of worry, not a shade of care,
Not a blast of hurry touch the spirit there.

Every joy or trial falleth from above,
Traced upon our dial by the Sun of Love;
We may trust Him fully all for us to do.
They who trust Him wholly find Him wholly true.'),
(75, 'There''s the wonder of sunset at evening,
The wonder as sunrise I see;
But the wonder of wonders that thrills my soul
Is the wonder that God loves me.

Refrain:
O, the wonder of it all!
The wonder of it all!
Just to think that God loves me.
O, the wonder of it all!
The wonder of it all!
Just to think that God loves me.

There''s the wonder of springtime and harvest,
The sky, the stars, the sun;
But the wonder of wonders that thrills my soul
Is the wonder that''s only begun.'),
(76, 'O Love that wilt not let me go,
I rest my weary soul in thee;
I give thee back the life I owe,
that in thine ocean depths
its flow may richer, fuller be.

O Light that followest all my way,
I yield my flickering torch to thee;
my heart restores its borrowed ray,
that in they sunshine''s blaze
its day may brighter, fairer be.

O Joy that seekest me through pain,
I cannot close my heart to thee;
I trace the rainbow thru the rain,
and feel the promise is not vain,
that morn shall tearless be.

O Cross that liftest up my head,
I dare not ask to fly from thee;
I lay in dust life''s glory dead,
and from the ground there blossoms
red life that shall endless be.'),
(77, 'O love of God most full,
O love of God most free,
Come warm my heart,come fill my soul,
Come lead me unto Thee.

Warm as the glowing sun
So shines Thy love on me,
It wraps me ''round with kindly care,
It draws me unto Thee.

The wildest sea is calm,
The tempest brings no fear,
The darkest night is full of light,
Because Thy love is near.

O love of God most full,
O love of God most free,
It warms my heart, it fills my soul,
With might it strengthens me.'),
(78, 'For God so loved us,
He sent the Savior:
For God so loved us,
and loves me too.

Refrain:
Love so unending!
I''ll sing His praises,
God loves His children,
loves even me.

He sent the Savior,
the blest Redeemer;
He sent the Savior
to set me free.

He bade me welcome,
O word of mercy;
He bade me welcome,
O voice divine.

Glory and honor,
O Love eternal,
To Him be given
while life shall last.'),
(79, 'O love of God, how strong and true!
Eternal, and yet ever new;
Uncomprehended and unbought,
Beyond all knowledge and all thought.

O love of God, how deep and great,
Far deeper than man''s deepest hate;
Self-fed, self-kindled like the light,
Changeless, eternal, infinite.

We read thee best in Him who cam
To bear for us the cross of shame;
Sent by the Father from on high,
Our life to live, our death to die.

We read thy power to bless and save,
E''en in the darkness of the grave;
Still more in resurrection light
We read the fullness of thy might.

O love of God, our shield and stay
Through all the perils of our way!
Eternal love, in thee we rest,
Forever safe, forever blest.'),
(80, 'O world of God, so vast and strange,
profound and wonderful and fair,
Beyond the utmost reach of thought,
but not beyond a Father''s care!
We are not strangers on this earth
whirling amid the suns of space;
We are God''s children, this our home,
with those of every clime and race.

O world of man where life is lived,
so strangely mingling joy and pain,
So full of evil and of good,
so needful that the good shall reign!
It is this world that God has loved,
and goodness was its Maker''s plan,
The promise of God''s triumph is
His coming in a Son of Man.

O world of time''s farstretching years!
there was a day when time stood still,
A central moment when there rose
across upon a cruel hill;
In pain and death love''s power was seen,
the mystery of time revealed,
The wisdom of the ways of God,
the grace through which man''s hurt is healed.'),
(81, 'Though I speak with tongues of men and angels,
Though I have the prophet''s gift,
Though I hold the keys to hidden knowledge,
Though my faith can mountains shift:
Without love I am no better,
Without love it''s all for naught;
Lord, You spent Your life in loving others:
What this means I would be taught.

Love is patient, knows no envy,
Never gloats when others sin;
Love is never glad to see injustice,
Always wants the truth to win.
There''s no end to love''s endurance,
There''s no test it cannot face;
Lord, You spent Your life in loving others:
I shall fail without Your grace.

Though there''ll be an end to hidden knowledge,
Visions, raptures, prophecy:
Faith and hope and love shall last forever,
Love the greatest of the three.
Without love I am no better,
Without love it''s all for naught;
Lord, You gave Your life in saving others:
What this means I would be taught.'),
(82, 'Before Jehovah''s awful throne,
Ye nations, bow with sacred joy;
Know that the Lord is God alone;
He can create, and He destroy.

His sovereign power, without our aid,
Made us of clay, and formed us men;
and when like wandering sheep we strayed,
He brought us to His fold again.

We''ll crowd His gates with thankful songs,
High as the heavens our voices raise;
And earth, with her ten thousand tongues,
Shall fill His courts with sounding praise.

Wide as the world is His command,
Vast as Eternity His love;
Firm as a rock His truth shall stand,
When rolling years shall cease to move.'),
(83, 'O worship the King, all glorious above,
O gratefully sing His wonderful love;
Our Shield and Defender, the Ancient of Days,
Pavilioned in splendor, and girded with praise.

O tell of His might, O sing of His grace,
Whose robe is the light, whose canopy space,
His chariots of wrath the deep thunderclouds form,
And dark is His path on the wings of the storm.

Thy bountiful care, what tongue can recite?
It breathes in the air, it shines in the light;
It streams from the hills, it descends to the plain,
And sweetly distills in the dew and the rain.

Frail children of dust, and feeble as frail,
In Thee do we trust, nor find Thee to fail;
Thy mercies how tender, how firm to the end!
Our Maker, Defender, Redeemer, and Friend.'),
(84, 'God the Omnipotent! King, who ordainest
Great winds Thy clarions, the lightnings Thy sword;
Show forth Thy pity on high where Thou reignest,
Give to us peace, O most merciful Lord.

God the all merciful! earth hath forsaken
Thy precepts holy, and slighted Thy word;
Bid not Thy wrath in its terrors awaken;
Give to us peace, O most merciful Lord.

God the all righteousness One! man hath defied Thee;
Yet to eternity standeth Thy word;
Falsehood and wrong shall not tarry beside Thee;
Prosper the right, O most merciful Lord.

So shall we render Thee thankful devotion,
For Thy deliverance from peril and sword,
Singing in chorus from ocean to ocean,
"Thine is the power and the glory, O Lord."'),
(85, 'Eternal Father, strong to save,
Whose arm doth bind the restless wave,
Who bidd''st the mighty ocean deep
Its own appointed limits keep;
O hear us when we cry to Thee
For those in peril on the sea.

O Saviour, whose almighty word
The winds and waves submissive heard,
Who walkedst on the foaming deep,
And calm amid its rage didst sleep;
O hear us when we cry to Thee
For those in peril on the sea.

O Sacred Spirit, who didst brood
Upon the chaos dark and rude,
Who badd''st its angry tumult cease,
And gavest light and life and peace;
O hear us when we cry to Thee
For those in peril on the sea.

O Trinity of love and power,
Our brethren shield in danger''s hour;
From rock and tempest, fire and foe,
Protect them wheresoe''er they go;
And ever let there rise to Thee
Glad hymns of praise from land and sea.'),
(86, 'O Lord my God
When I in awesome wonder
Consider all the worlds Thy Hands have made
I see the stars
I hear the rolling thunder
Thy power throughout the universe displayed

Refrain:
Then sings my soul
My Saviour God to Thee
How great Thou art
How great Thou art
Then sings my soul
My Saviour God to Thee
How great Thou art
How great Thou art

When through the woods
And forest glades I wander
And hear the birds sing sweetly in the trees
When I look down
From lofty mountain grandeur
And see the brook and feel the gentle breeze

And when I think
That God His Son not sparing
Sent Him to die I scarce can take it in
That on the Cross
My burden gladly bearing
He bled and died to take away my sin.

When Christ shall come
With shouts of acclamation
And take me home
What joy shall fill my heart
Then I shall bow
In humble adoration
And then proclaim
"My God, how great Thou art!"'),
(87, 'God who spoke in the beginning,
Forming rock and shaping spar,
Set all life and growth in motion,
Earthly world and distant star;
He who calls the earth to order
Is the ground of what we are.

God who spoke thro'' men and nations,
Thro'' events long past and gone,
Showing still today His purpose,
Speaks supremely through His Son;
He who calls the earth to order
Gives His word and it is done.

God whose speech becomes incarnate-
Christ is servant, Christ is Lord-
Calls us to a life of service,
Heart and will to action stirred;
He who uses man''s obedience
Has the first and final word.'),
(88, 'I sing the almighty power of God,
that made the mountains rise,
that spread the flowing seas abroad,
and built the lofty skies.
I sing the wisdom that ordained
the sun to rule the day;
the moon shines full at God''s command,
and all the stars obey.

I sing the goodness of the Lord,
who filled the earth with food,
who formed the creatures thru the Word,
and then pronounced them good.
Lord, how thy wonders are displayed,
where''er I turn my eye,
if I survey the ground I tread,
or gaze upon the sky!

There''s not a plant or flower below,
but makes thy glories known,
and clouds arise, and tempests blow,
by order from thy thrown;
while all that borrows life from thee
is ever in thy care;
and everywhere that we can be,
thou, God, art present there.'),
(89, 'Let all the earth their voices raise,
To sing the great Jehovah''s praise,
And bless His holy name:
His glory let the people know,
His wonders to the nations show,
His saving grace proclaim.

He framed the globe; He built the sky;
He made the shining worlds on high,
And reigns in glory there:
His beams are majesty and light;
His beauties, how divinely bright!
His dwelling place, how fair!

Come, the great day, the glorious hour,
When earth shall feel His saving power,
All nations fear His name;
Then shall the race of men confess
The beauty of His holiness,
His saving grace proclaim.'),
(90, 'Eternal God, whose power upholds Both flower and flaming star,
To whom there is no here nor there, No time, no near nor far,
No alien race, no foreign shore, No child unsought, unknown:
O send us forth, Your prophets true, To make all lands Your own!

O God of truth, whom science seeks And reverent souls adore,
Illumine every earnest mind Of every clime and shore:
Dispel the gloom of error''s night, Of ignorance and fear,
Until true wisdom from above Shall make life''s pathway clear!

O God of beauty, oft revealed In dreams of human art,
In speech that flows to melody, In holiness of heart:
Teach us to ban al ugliness, And all disharmony,
Till all shall know the loveliness Of lives made fair and free!

O God of righteousness and grace, Seen in the Christ, Your Son,
Whose life and death reveal Your face, By whom Your will was done;
Help us to spread Your gracious reign Till greed and hate shall cease,
And kindness dwell in human hearts, And all the earth find peace!'),
(91, 'Ye watchers and ye holy ones,
Bright seraphs, cherubim and thrones,
Raise the glad strain, Alleluia!
Cry out, dominions, princedoms, powers,
Virtues, archangels, angels'' choirs:

Refrain:
Alleluia! Alleluia!
Alleluia! Alleluia!
Alleluia!

O higher than the cherubim,
More glorious than the seraphim,
Lead their praises, Alleluia!
Thou bearer of th''eternal Word,
Most gracious, magnify the Lord.

O friends, in gladness let us sing,
Supernal anthems echoing,
Alleluia! Alleluia!
To God the Father, God the Son,
And God the Spirit, Three in One.'),
(92, 'This is my Father''s world,
and to my listening ears
all nature sings, and round me rings
the music of the spheres.
This is my Father''s world:
I rest me in the thought
of rocks and trees, of skies and seas;
his hand the wonders wrought.

This is my Father''s world,
the birds their carols raise,
the morning light, the lily white,
declare their maker''s praise.
This is my Father''s world:
he shines in all that''s fair;
in the rustling grass I hear him pass;
he speaks to me everywhere.

This is my Father''s world.
O let me ne''er forget
that though the wrong seems oft so strong,
God is the ruler yet.
This is my Father''s world:
why should my heart be sad?
The Lord is King; let the heavens ring!
God reigns; let the earth be glad!'),
(93, 'Each little flow''r that opens
Each little bird that sings
He made their glowing colours
He made their tiny wings.

Refrain:
All things bright and beautiful
All creatures great and small
All things wise and wonderful
The Lord God made them all.

The purple-headed mountain
The river running by
The sunset and the morning
That brighten up the sky.

The cold wind in the winter
The pleasant summer sun
The ripe fruits in the garden
He made them, every one.

He gave us eyes to see them
And lips that we might tell
How great is God Almighty
Who has made all things well.'),
(94, 'Nature with open volume stands,
To spread its Maker''s praise abroad;
And every labor of His hands
Shows something worthy of our God.

But in the grace that rescued us
His brightest form of glory shines;
''Tis fairest drawn upon the cross
In precious blood and crimson lines.

Here His whole name appears complete.
Nor wit can guess, nor reason prove,
Which of the letters best is writ,
The pow''r, the wisdom, or the love.

We would forever speak His name
In sounds to mortal ears unknown,
With angels join to praise the Lamb,
And worship at His Father''s throne.'),
(95, 'Spring has now unwrapped the flowers,
Day is fast reviving,
Life in all her growing powers
Towards the light is striving:
Gone the iron touch of cold,
Winter time and frost time,
Seedlings, working through the mould,
Now make up for lost time.

Herb and plant that winter long,
Slumbered at their leisurek,
Now be stirring, green and strong,
Find in growth their pleasure:
All the world with beauty fills,
Gold the green enhacing;
Flowers make glee among the hills,
Set the meadows dancing.

Through each wonder of fair days
God Himself expresses;
Beauty follows all His ways,
As the world He blesses:
So, as He renews the earth,
Artist without rival,
In His grace of glad new birth
We must seek revival.'),
(96, 'The spacious firmament on high,
With all the blue, ethereal sky,
And spangled heavens, a shining frame,
Their great Original proclaim.
Th''unwearied sun from day to day
Does his Creator''s power display,
And publishes to every land
The work of an almighty hand

Soon as the evening shades prevail,
The moon takes up the wondrous tale;
And nightly to the listening earth
Repeats the story of her birth;
While all the stars that round her burn,
And all the planets in their turn,
Confirm the tidings as they roll,
And spread the truth from pole to pole

What though in solemn silence all
Move round the dark terrestrial ball?
What though no real voice nor sound
Amid their radiant orbs be found?
In reason''s ear they all rejoice
And utter forth a glorious voice,
Forever singing as they shine,
"The hand that made us is divine."'),
(97, 'Lord of the boundless curves of space
And time''s deep mystery,
To Your creative might we trace
All nature''s energy.

Your mind conceived the galaxy,
Each atom''s secret planned,
And every age of history
Your purpose, Lord, has spanned.

Yours is the image stamped on man,
Though marred by man''s own sin;
And Yours the liberating plan
Again his soul to win.

Give us to know Your truth; but more,
The strength to do Your will;
Until the love our souls adore
Shall all our being fill.'),
(98, 'Can you count the stars that brightly
Twinkle in the midnight sky?
Can you count the clouds, so lightly
O''er the meadows floating by?
God, the Lord, doth mark their number
With His eyes that never slumber;
He hath made every one,
He hath made them every one.

Can you count the wings now flashing
In the sunshine''s golden light?
Can you count the fishes splashing
In the cooling waters bright?
God, the Lord, a name hath given,
To all creatures under heaven;
He hath named them every one,
He hath named them every one.

Do you know how many children
Rise each morning blithe and gay?
Can you count their jolly voices,
Singing sweetly day by day?
God hears all the happy voices,
In their merry songs rejoices;
And He loves them, every one,
And He loves them, every one.'),
(99, 'Be not dismayed whate''er betide,
God will take care of you;
beneath his wings of love abide,
God will take care of you.

Refrain:
God will take care of you,
through every day, o''er all the way;
he will take care of you,
God will take care of you.

Through days of toil when heart doth fail,
God will take care of you;
when dangers fierce your path assail,
God will take care of you.

All you may need he will provide,
God will take care of you;
nothing you ask will be denied,
God will take care of you.

No matter what may be the test,
God will take care of you;
lean, weary one, upon his breast,
God will take care of you.'),
(100, 'Great is Thy faithfulness, O God my Father;
There is no shadow of turning with Thee;
Thou changest not, Thy compassions, they fail not;
As Thou hast been, Thou forever will be.

Refrain:
Great is Thy faithfulness!
Great is Thy faithfulness!
Morning by morning new mercies I see.
All I have needed Thy hand hath provided;
Great is Thy faithfulness, Lord, unto me!

Summer and winter and springtime and harvest,
Sun, moon and stars in their courses above
Join with all nature in manifold witness
To Thy great faithfulness, mercy and love.

Pardon for sin and a peace that endureth
Thine own dear presence to cheer and to guide;
Strength for today and bright hope for tomorrow,
Blessings all mine, with ten thousand beside!'),
(101, 'Children of the heavenly Father
Safely in His bossom gather;
Nestling bird nor star in heaven
Such a refuge e''er was given.

God His own doth tend and nourish,
In His holy love they flourish;
From all evil things He spares them,
In His mighty arms He bears them.

Neither life nor death shall ever
From the Lord His children sever;
Unto them His grace He showeth,
And their sorrows all He knoweth.

Praise the Lord in joyful numbers,
Your Protector never slumbers;
At the will of your Defender
Every foe-man must surrender.

Though He giveth or He taketh,
God His children ne''er forsaketh;
His the loving purpose solely
To preserve them pure and holy.'),
(102, 'Unto the hills around shall I lift up my longing eyes?
O whence for me shall my salvation come,
from whence arise?
From God the Lord doth come my certain aid,
From God the Lord, who heav''n and earth hath made.

He will not suffer that thy foot be moved;
safe shalt Thou be
No careless slumber shall His eyelids close,
who keepeth thee.
Behold our God, the Lord, He slumbereth ne''er,
Who keepeth Israel in His holy care.

Jehovah is Himself thy keeper true, thy changeless shade.
Jehovah thy defense on thy right hand Himself hath made
And thee no sun by day shall ever smite,
No moon shall harm thee in the silent night.

From every evil shall He keep thy soul, from every sin;
Jehovah shall preserve thy going out, thy coming in.
Above thee watching, He, whom adore,
Shall keep thee henceforth, yea, forevermore.'),
(103, 'O God, our help in ages past,
our hope for years to come,
our shelter from the stormy blast,
and our eternal home!

Under the shadow of thy throne,
still may we dwell secure;
sufficient is thine arm alone,
and our defense is sure.

Before the hills in order stood,
or earth received her frame,
from everlasting, thou art God,
to endless years the same.

A thousand ages, in thy sight,
are like an evening gone;
short as the watch that ends the night,
before the rising sun.

O God, our help in ages past,
our hope for years to come;
be thou our guide while life shall last,
and our eternal home!'),
(104, 'My Shepherd will supply my need,
Jehovah is His name.
In pastures fresh He makes me feed
Beside the living stream.
He brings my wand''ring spirit back
When I forsake His ways,
And leads me, for His mercy''s sake,
In paths of truth and grace.

When I walk through the shades of death,
Thy presence is my stay;
A word of Thy supporting breath
Drives all my fears away.
Thy hand in sight of all my foes
Doth still my table spread;
My cup with blessings over flows,
Thine oil anoints my head.

The sure provisions of my God
Attend me all my days;
O may Thy house be mine abode
And all my work be praise.
There would I find a settled rest
While others go and come;
No more a stranger or a guest,
But like a child at home.'),
(105, 'Sing to the great Jehovah''s praise!
All praise to Him belongs;
Who kindly lengthens out our days,
In spires our choicest songs,
Inspires our choicest songs.

His providence hath brought us through
Another various year;
We all, with vows and anthems new,
Before our God appear,
Before our God appear.

O God, Thy mercies past we own,
And Thy continued care;
To Thee presenting through Thy Son
What e''er we have and are,
What e''er we have and are.'),
(106, 'Give to our God immortal praise;
Mercy and truth are all His ways:
Wonders of grace to God belong,
Repeat His mercies in your song.

Give to the Lord of lords renown,
The King of kings with glory crown:
His mercies ever shall endure
When lords and kings are known no more.

He sent His Son with power to save
From guilt and darkness and the grave:
Wonders of grace to God belong,
Repeat His mercies in your song.

Thro'' this vain world He guides our feet,
And leads us to His heav''nly seat;
His mercies ever shall endure,
When this vain world shall be no more.'),
(107, 'God moves in a mysterious way
His wonders to perform;
He plants His footsteps in the sea,
And rides upon the storm.

Ye fearful saints, fresh courage take;
The clouds ye so much dread
Are big with mercy, and shall break
In blessings on your head.

Judge not the Lord by feeble sense,
But trust Him for His grace;
Behind a frowning providence
He hides a smiling face.

His purposes will ripen fast,
Unfolding every hour;
The bud may have a bitter taste,
But sweet will be the flower.

Blind unbelief is sure to err,
And scan His work in vain;
God is His own interpreter,
And He will make it plain.'),
(108, 'Amazing grace! How sweet the sound
that saved a wretch like me!
I once was lost, but now am found;
was blind, but now I see.

''Twas grace that taught my heart to fear,
and grace my fears relieved;
how precious did that grace appear
the hour I first believed.

The Lord has promised good to me,
his word my hope secures;
he will my shield and portion be,
as long as life endures.

Through many dangers, toils, and snares,
I have already come;
''tis grace hath brought me safe thus far,
and grace will lead me home.

When we''ve been there ten thousand years,
bright shining as the sun,
we''ve no less days to sing God''s praise
than when we first begun.'),
(109, 'Marvelous grace of our loving Lord.
Grace that exceeds our sin and our guilt!
Yonder on Calvary''s mount outpoured
There where the blood of the Lamb was spilt.

Refrain:
Grace, grace, God''s grace,
Grace that will pardon and cleanse within
Grace, grace, God''s grace,
Grace that is greater than all our sin!

Sin and despair, like the sea waves cold,
Threaten the soul with infinite loss;
Grace that is greater, yes, grace untold
Points to the Refuge, the mighty Cross.

Marvelous, infinite, matchless grace,
Freely bestowed on all who believe!
You that are longing to see His face,
Will you this moment His grace receive?'),
(110, 'God''s free mercy streameth over all the world,
And His banner gleameth, By His church unfuried;
Broad and deep and glorious, As the heaven above,
Shines in might victorious His eternal love.

Summer suns are glowing over land and sea;
Happy light is flowing, Bountiful and free;
Everything rejoices in the mellow rays;
Earth''s ten thousand voices swell the psalm of praise.

Lord, upon our blindness thy pure radiance pour;
For Thy loving kindness we would love Thee more;
And when clouds are drifting dark across the sky,
Then, the veil uplifting, father, be Thou nigh.

We will never doubt Thee, tho'' veil Thy light;
Life is dark without Thee, death with Thee is bright.
Light of light, shine o''er us on our pilgrim way,
Go Thou still before us to the endless day.'),
(111, 'My Father is omnipotent
And that you can''t deny;
A God of might and miracles;
''Tis written in the sky.

Refrain:
It took a miracle to put the stars in place;
It took a miracle to hang the world in space.
But when He saved my soul,
Cleansed and made me whole,
It took a miracle of love and grace!

Though here His glory has been shown,
We still can''t fully see
The wonders of His might, His throne;
''Till eternity.

The Bible tells us of His power
And wisdom all way through;
And every little bird and flower
Are testimonies, too.'),
(112, 'Let us with a gladsome mind
Praise the Lord, for He is kind:
For His mercies shall endure,
Ever faithful, ever sure.

He, with all commanding might,
Filled the new made world with light:
For His mercies shall endure,
Ever faithful, ever sure.

All things living He does feed;
His full hand supplies their need:
For His mercies shall endure,
Ever faithful, ever sure.

Let us then with gladsome mind
Praise the Lord, for He is kind:
For His mercies shall endure,
Ever faithful, ever sure.'),
(113, 'As pants the hart for cooling streams
When heated in the chase,
So longs my soul, O God, for Thee,
And Thy refreshing grace.

For Thee, my God, the living God,
My thirsty soul doth pine:
O when shall I behold Thy face,
Thou Majesty divine?

Why restless, why cast down, my soul?
Hope still, and thou shalt sing
The praise of Him who is thy God,
Thy health''s eternal spring.

To Father, Son, and Holy Ghost,
The God whom we adore,
Be glory, as it was, is now,
And shall be evermore.'),
(114, 'There''s a wideness, in God''s mercy,
like the wideness of the sea;
There is mercy, with the Savior,
Which is more than liberty.

There is welcome, for the sinner,
and more graces for the good;
There is mercy, with the Savior,
There is healing in His blood.

For the love of God is broader
Than the measure of man''s mind.
And the heart of the Eternal,
is most wonderfully kind.

If our love were but more simple,
We should take Him at His word;
And our lives would be all sunshine,
In the sweetness of our Lord.'),
(115, 'O come, O come, Emmanuel,
And ransom captive Israel,
That mourns in lonely exile here
Until the Son of God appear.

Refrain:
Rejoice! Rejoice!
Emmanuel shall come to thee,
O Israel.

O come, Thou Wisdom from on high,
And order all things far and night;
To us the path of knowledge show,
And cause us in her ways to go.

O come, Desire of nations, bind
In one the hearts of all mankind;
Bid Thou our sad divisions cease,
And be Thyself our King of Peace.'),
(116, 'Of the Father''s love begotten,
Ere the worlds began to be,
He is Alpha and Omega,
He the source, the ending He,
Of the things that are, that have been,
And that future years shall see,
Evermore and evermore! Amen.

O ye heights of heaven adore Him;
Angel hosts, His praises sing;
Powers, dominions, bow before Him,
And extol our God and King;
Let no tongue on earth be silent,
Every voice in concert ring,
Evermore and evermore! Amen.

Christ, to Thee with God the Father
And, O Holy Ghost, to Thee,
Hymn and chant and high thanksgiving
And unwearied praises be.
Honor, glory, and dominion,
And eternal victory,
Evermore and evermore! Amen.'),
(117, 'The advent of our God
With eager prayers we greet,
And singing haste upon His road
His coming reign to meet.

The everlasting Son
Was born to make us free;
And He a servant''s form put on
To gain our liberty.

As Judge, on clouds of light,
He soon will come again,
His scattered people to unite
With them in heaven to reign.

Praise to the incarnate Son
Who comes to set us free,
With Father, Spirit, ever one,
To all eternity.'),
(118, 'The first noel the angel did say
Was to certain poor shepherds in fields where they lay;
In fields where they lay keeping their sheep,
On a cold winter''s night that was so deep.

Refrain:
Noel, Noel, Noel, Noel,
Born is the King of Israel

They looked up and say a star
Shining in the east, beyond them far,
And to the earth it gave great light,
And so it continued both day and night.

And by the light of that same star,
Three wise men came from country far,
And to the earth it gave great light,
And to follow the star wherever it went.

This star drew nigh to the northwest,
O''er Bethlehem it took its rest,
And there it did both stop and stay,
Right over the place where Jesus lay.

Then entered in those wise men three,
Full reverently upon the knee,
And offered there, in His presence,
Their gold, and myrrh, and frankincense.'),
(119, 'Angels from the realms of glory,
Wing your flight o`er all the earth;
Ye, who sang creation`s story,
Now proclaim Messiah`s birth;
Come and worship, Come and worship,
Worship Christ, the newborn King.

Shepherds, in the field abiding,
Watching o`er your flocks by night,
God with man is now residing;
Yonder shines the Infant Light;
Come and worship, Come and worship,
Worship Christ, the newborn King.

Sages, leave your contemplations,
Brighter visions beam afar;
Seek the great Desire of nations;
Ye have seen His natal star;
Come and worship, Come and worship,
Worship Christ, the newborn King.

Saints, before the altar bending,
Watching long in hope and fear,
Suddenly the Lord, descending,
In His temple shall appear;
Come and worship, Come and worship,
Worship Christ, the newborn King.'),
(120, 'There''s a song in the air!
There''s a star in the sky!
There''s a mother''s deep prayer
And a baby''s low cry!
And the star rains its fire
while the beautiful sing,
For the manger of Bethlehem
cradles a King!

There''s a tumult of joy
O''er the wonderful birth,
For the virgin''s sweet boy
Is the Lord of the earth.
Aye! the star rains its fire
while the beautiful sing,
For the manger of Bethlehem
cradles a King!

In the light of that star
Lie the ages impearled;
And that song from afar
Has swept over the world.
Every hearth is aflame
and the beautiful sing
In the homes of the nations
that Jesus is King!

We rejoice in the light,
And we echo the song
That comes down through the night
From the heavenly throng.
Aye! we shout to the lovely evangel they bring,
And we greet in His cradle
our Savior and King!'),
(121, 'While shepherds kept their watching
O''er silent flocks by night,
Behold throughout the heavens
There shone a holy light.

Refrain:
Go, tell it on the mountain,
Over the hills and everywhere:
Go, tell it on the mountain
That Jesus Christ is born!

The shepherds feared and trembled
When lo! Above the earth
Rang out the angel chorus
That hailed our Savior''s birth.

Down in a lowly manger
The humble Christ was born,
And brought us God''s salvation
That blessed Christmas morn.'),
(122, 'Hark! the herald angels sing,
"Glory to the new born King,
peace on earth, and mercy mild,
God and sinners reconciled!"
Joyful, all ye nations rise,
join the triumph of the skies;
with th'' angelic host proclaim,
"Christ is born in Bethlehem!"
Hark! the herald angels sing,
"Glory to the new born King!"

Christ, by highest heaven adored;
Christ, the everlasting Lord;
late in time behold him come,
offspring of a virgin''s womb.
Veiled in flesh the Godhead see;
hail th'' incarnate Deity,
pleased with us in flesh to dwell,
Jesus, our Emmanuel.
Hark! the herald angels sing,
"Glory to the new born King!"

Hail the heaven-born Prince of Peace!
Hail the Sun of Righteousness!
Light and life to all he brings,
risen with healing in his wings.
Mild he lays his glory by,
born that we no more may die,
born to raise us from the earth,
born to give us second birth.
Hark! the herald angels sing,
"Glory to the new born King!"'),
(123, 'As with gladness men of old
Did the guiding star behold,
As with joy they hailed its light,
Leading onward, beaming bright,
So, most gracious Lord, may we
Evermore be led to Thee.

As with joyful steps they sped
To that lowly manger bed,
There to bend the knee before
Him whom heav''n and earth adore,
So may we with willing feet
Ever seek Thy mercy seat.

As they offered gifts most rare
At that manger rude and bare,
So may we with holy joy,
Pure, and free from sin''s alloy,
All our costliest treasures bring,
Christ, to Thee our heav''nly King.

Holy Jesus, every day
Keep us in the narrow way;
And, when earthly things are past,
Bring our ransomed souls at last
Where they need no star to guide,
Where no clouds Thy glory hide.'),
(124, 'Away in a manger, no crib for a bed,
The little Lord Jesus laid down his sweet head.
The stars in the sky looked down where he lay,
The little Lord Jesus asleep in the hay.

The cattle are lowing, the baby awakes,
But little Lord Jesus no crying he makes.
I love Thee, Lord Jesus, look down from the sky
And stay by my cradle til morning is nigh.

Be near me, Lord Jesus, I ask Thee to stay
Close by me forever, and love me, I pray.
Bless all the dear children in thy tender care,
And take us to heaven, to live with Thee there.'),
(125, 'Joy to the world, the Lord is come!
Let earth receive her King;
Let every heart prepare Him room,
And heaven and nature sing, And heaven and nature sing,
And heaven, and heaven and nature sing.

Joy to the earth, the Savior reigns!
Let men their songs employ;
While fields and floods, rocks, hills, and plains,
Repeat the sounding joy, Repeat the sounding joy,
Repeat, repeat the sounding joy.

No more let sin and sorrow grow,
Nor thorns infest the ground;
He comes to make His blessings flow
Far as the curse is found, Far as the curse is found,
Far as, far as the curse is found.

He rules the world with truth and grace,
And makes the nations prove
The glories of His righteousness,
And wonders of His love, And wonders of His love,
And wonders, and wonders of His love.'),
(126, 'In the bleak midwinter Frosty wind made moan;
Earth stood hard as iron, Water like a stone;
Snow had fallen, snow on snow, Snow on snow,
In the bleak minwinter, Long ago.

Angels and archangels May have gathered there,
Chrubim and seraphim Thronged the air.
But His mother only In her maiden bliss,
Worshiped the beloved With a kiss.

What can I give Him, Poor as I am?
If I were a shepherd I would bring a lamb;
If I were a wise man I would do my part;
Yet what can I give Him? Give my heart.'),
(127, 'Infant holy, infant lowly,
For His bed a cattle stall;
Oxen lowing, little knowing
Christ the babe is Lord of all;
Swift are winging angels singing,
Noels ringing, tidings bringing,
Christ the babe is Lord of all,
Christ the babe is Lord of all.

Flocks were sleeping, shepherds keeping
Vigil till the morning new;
Saw the glory, heard the story,
Tidings of the gospel true;
Thus rejoicing, free from sorrow,
Praising voicing greet the morrow,
Christ the babe was born for you,
Christ the babe was born for you.'),
(128, 'Break forth, O beauteous heavenly light,
And usher in the morning;
Ye shepherds, shrink not with affright,
But hear the angel''s warning.
This child, now weak in infancy
Our confidence and joy shall be,
The power of Satan breaking,
Our peace eternal making.

Break forth, O beauteous heavenly light,
To herald our salvation;
He stoops to earth the God of might,
Our hope and expectation.
He comes in human flesh to dwell,
Our God with us, Immanuel,
The night of darkness ending,
Our fallen race be friending.'),
(129, 'As it fell upon a night
In the winter weather,
Angels bright in starry height
Began to sing together.

Shepherds sleeping on the plain
Woke to see the glory,
All amazed they stood and gazed
And heard the angels'' story.

Unto you a child is born
In a manger lowly,
Humble, He, yet born to be
The King of Love most holy.

Happy angels from afar,
Cease your singing never!
In excelsis gloria!
For ever and for ever.'),
(130, 'It came upon the midnight clear,
That glorious song of old,
From angels bending near the earth,
To touch their harps of gold:
"Peace on the earth, goodwill to men
From heavens all gracious King!"
The world in solemn stillness lay
To hear the angels sing.

Still through the cloven skies they come,
With peaceful wings unfurled;
And still their heavenly music floats
O''er all the weary world:
Above its sad and lowly plains
They bend on hovering wing,
And ever o''er its Babel sounds
The blessed angels sing.

O ye beneath life''s crushing load,
Whose forms are bending low,
Who toil along the climbing way
With painful steps and slow;
Look now, for glad and golden hours
Come swiftly on the wing;
Oh rest beside the weary road
And hear the angels sing.'),
(131, 'Lo, how a rose e''re blooming
From tenderstem hath sprung,
Of Jesse''s lineage coming
As men of old have sung.
It came, a floweret bright,
Amid the cold of winter
When half spent was the night.

Isaiah ''twas foretold it,
The Rose I have in mind,
With Mary we beheld it,
The virgin mother kind.
To show God''s love aright
She bore to them a Savior,
When half spent was the night.'),
(132, 'O come, all ye faithful, joyful and triumphant,
O come ye, O come ye to Bethlehem!
Come and behold Him, born the King of angels!
O come, let us adore Him, O come, let us adore Him,
O come, let us adore Him, Christ, the Lord!

Sing, choirs of angels sing in exultation,
O sing all ye citizens of heaven above!
Glory to God, all glory in the highest!
O come, let us adore Him, O come, let us adore Him,
O come, let us adore Him, Christ, the Lord!

Yea, Lord, we greet Thee, born this happy morning,
Jesus, to Thee be all glory given;
Word of the Father, now in flesh appearing!
O come, let us adore Him, O come, let us adore Him,
O come, let us adore Him, Christ, the Lord!'),
(133, 'He was born in a stable bare,
On bed of straw how
He sleeps so soundly,
He was born in a stable bare,
Let us worship and to Him bow.

Ages long since are past and gone,
When the wise men foretold His coming,
Ages long since are past and gone,
When the wise men foretold His birth.'),
(134, 'O Jesus sweet, O Jesus mild,
Thy Father''s will hast Thou fulfilled;
For Thou hast left Thy heavenly throne
Our lowly state to make Thine own.
O Jesus sweet, O Jesus mild.

O Jesus sweet, O Jesus mild,
With joy hast Thou the whole world filled;
Thou comest down from heaven''s hall
To comfort us whom tears enthrall.
O Jesus sweet, O Jesus mild.

O Jesus sweet, O Jesus mild,
Thou art love''s image undefiled.
Inflame our hearts with love''s pure fire,
That we may share Thy heart''s desire.
O Jesus sweet, O Jesus mild.

O Jesus sweet, O Jesus mild,
Help us to do as Thou hast willed.
What e''er we have belongs to Thee:
O may we ever faithful be.
O Jesus sweet, O Jesus mild.'),
(135, 'O little town of Bethlehem, how still we see thee lie!
Above thy deep and dreamless sleep the silent stars go by.
Yet in thy dark streets shineth the everlasting Light;
The hopes and fears of all the years are met in thee tonight.

For Christ is born of Mary, and gathered all above,
While mortals sleep, the angels keep their watch of wondering love.
O morning stars together, proclaim the holy birth,
And praises sing to God the King, and peace to men on earth!

How silently, how silently, the wondrous Gift is giv''n;
So God imparts to human hearts the blessings of His heav''n.
No ear may hear His coming, but in this world of sin,
Where meek souls will receive Him still, the dear Christ enters in.

O holy Child of Bethlehem, descend to us, we pray;
Cast out our sin, and enter in, be born in us today.
We hear the Christmas angels the great glad tidings tell;
O come to us, abide with us, our Lord Emmanuel!'),
(136, 'Good Christians, now rejoice,
With heart, and soul, and voice;
Give ye heed to what we say:
Jesus Christ is born today;
Ox and ass before Him bow,
And He is in the manger now.
Crist is born today!
Crist is born today!

Good Christians, now rejoice,
With heart, and soul, and voice;
Now ye hear of endless bliss:
Jesus Christ was born for this!
He hath ope''d the heav''nly door,
And we are blessed evermore.
Christ was born for this!
Christ was born for this!

Good Christians, now rejoice,
With heart, and soul, and voice;
Now ye need not fear the grave:
Jesus Christ was born to save!
Calls you one and calls you all
To gain His everlasting hall.
Christ was born to save!
Christ was born to save!'),
(137, 'We three kings of Orient are;
Bearing gifts we traverse afar
Field and fountain, moor and mountain,
Following yonder star.

Refrain:
O star of wonder, star of night,
Star with royal beauty bright,
Westward leading, still proceeding,
Guide us to Thy perfect light.

Born a King on Bethlehem''s plain,
Gold I bring to crown Him again,
King forever, ceasing never
Over us all to reign.

Frankincense to offer have I;
Incense owns a Deity nigh;
Prayer and praising all men raising,
Worship Him, God on high.

Myrrh is mine; its bitter perfume
Breathes a life of gathering gloom:
Sorrowing, sighing, bleeding, dying,
Sealed in the stonecold tomb.

Glorious now behold Him arise,
King and God and sacrifice;
Alleluia, Alleluia!
Sounds through the earth and skies.'),
(138, 'There''s a star in the east on Christmas morn.
Rise Up, shepherd, and follow.
It will lead to the place where the Savior''s born,
Rise Up, shepherd, and follow.

Refrain:
Leave your sheep and leave your lamb,
Rise Up, shepherd, and follow.
Leave your ewes and leave your rams,
Rise Up, shepherd, and follow. Follow, Follow,
Rise Up, shepherd, and follow.
Follow the star of Bethlehem,
Rise Up, shepherd, and follow.

If you take goo heed tothe angel''s words,
Rise Up, shepherd, and follow.
You''ll forget your flocks, you''ll forget your herds
Rise Up, shepherd, and follow.'),
(139, 'While shepherds watched their flocks by night,
All seated on the ground,
The angel of the Lord came down,
And glory shone around.

"Fear nor!" said he- for mighty dread
Had seized their troubled mind-
"Glad tidings of great joy I bring,
To you and all mankind.

"To you, in David''s town this day,
Is born of David''s line,
The Savior who is Christ the Lord;
And this shall be the sign:

"The heavenly Babe you there shall find
To human view displayed,
All meanly wrapped in swathing bands,
And in a manger laid."

Thus spake the seraph; and forth with
Appeared a shining throng
Of angels praising God on high,
Who thus addressed their song:

"All glory be to God on high,
And to the earth be peace;
Good will henceforth from heaven to men,
Begin and never cease!"'),
(140, 'Thou didst leave Thy throne
And Thy kingly crown
When Thou camest to earth for me;
But in Bethlehem''s home
Was there found no room
For Thy holy nativity.

Refrain:
O come to my heart, Lord Jesus,
There is room in my heart for Thee.

Heaven''s arches rang
When the angels sang
Proclaiming Thy royal degree;
But of lowly birth
Didst Thou come to earth,
And in greatest humility.

Refrain:
My heart shall rejoice, Lord Jesus,
When Thou comest and callest for me.

The foxes found rest,
And the birds their nest
In the shade of the forest tree;
But Thy couch was the sod,
O Thou Son of God,
In the deserts of Galilee.

Thou camest, O Lord,
With the living word
That should set Thy people free;
But with mocking scorn,
And with crown of thorn,
They bore Thee to Calvary.

When the heavens shall ring,
And the angels sing,
At Thy coming to victory,
Let Thy voice call me home,
Saying, "Yet there is room,
There is room at My side for thee."')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(141, 'What child is this, who, laid to rest,
On Mary`s lap is sleeping?
Whom angels greet with anthems sweet,
While shepherds watch are keeping?

Refrain:
This, this is Christ the King,
Whom shepherds guard and angels sing:
Haste, haste to bring Him laud,
The babe, the son of Mary.

Why lies He in such mean estate
Where ox and ass are feeding?
Good Christian, fear: for sinners here
The silent Word is pleading.

So bring Him incense, gold, and myrrh,
Come, peasant, king, to own Him,
The King of kings salvation brings,
Let loving hearts enthrone Him.'),
(142, 'Angels we have heard on high
Sweetly singing o''er the plains,
And the mountains in reply
Echoing their joyous strains.

Refrain:
Gloria, in excelsis Deo!
Gloria, in excelsis Deo!

Shepherds, why this jubilee?
Why your joyous strains prolong?
What the gladsome tidings be
Which inspire your heavenly song?

Come to Bethlehem and see
Christ Whose birth the angels sing;
Come, adore on bended knee,
Christ the Lord, the newborn King.

See Him in a manger laid,
Whom the choirs of angels praise;
Mary, Joseph, lend your aid,
While our hearts in love we raise.'),
(143, 'Silent night! holy night!
All is calm, all is bright
Round yon virgin mother and Child,
Holy Infant so tender and mild,
Sleep in heavenly peace,
sleep in heavenly peace.

Silent night! holy night!
Shepherds quake at the sight,
glories stream from heaven afar,
heavenly hosts sing Alleluia;
Christ, the Savior is born,
Christ, the Savior is born.

Silent night! holy night!
Son of God, love''s pure light,
Radiant beams from Thy holy face,
with the dawn of redeeming grace,
Jesus, Lord, at Thy birth,
Jesus, Lord, at Thy birth.'),
(144, 'O sing a song of Bethlehem,
Of shepherds watching there,
And of the news that came to them
From angels in the air:
The light that shone on Bethlehem
Fills all the world today;
Of Jesus''birth and peace on earth
The angels sing alway.

O sing a song of Nazareth,
Of sunny days of joy,
O sing of fragrant flowers breath,
And of the sinless Boy:
For now the flowers of Nazareth
In every heart may grow;
Now spreads the fame of His dear name
On all the winds that blow.

O sing a song of Calvary,
Its glory and dismay;
Of Him who hung upon the tree,
And took our sins away:
For He who died on Calvary
Is risen from the grave;
And Christ, our Lord, by heaven adored,
Is mighty now to save.'),
(145, 'Songs of thankfulness and praise,
Jesus, Lord, to You we raise,
Manifested by the star
To the sages from afar;
Branch of royal David''s stem
In Your birth at Bethlehem;
Anthems be to You addressed,
God in man made manifested.

Manifest at Jordan''s stream,
Prophet''s, Priest, and King supreme;
And at Cana, wedding guest,
In Your Godhead manifest;
Manifest in power divine,
Changing water into wine;
Anthems be to You addressed,
God in man made manifested.

Manifest in making whole
Palsied limbs and fainting soul;
Manifest in valliant fight,
Quelling all the devil''s might;
Manifest in gracious will,
Ever bringing good from ill;
Anthems be to You addressed,
God in man made manifested.

Grant us grace to see You, Lord,
Mirrored in Your holy Word;
May we imitate Your way,
And be pure, as pure we may,
That we like to You may be
At Your great epiphany;
Let us praise You, ever blest,
God in man made manifest.'),
(146, 'I think when I read that sweet story of old,
When Jesus was here among men,
How He called little children as lambs to His fold,
I should like to have been with Him then.

I wish that His hands had been placed on my head,
That His arm had been thrown around me,
And that I might have seen His kind look when He said,
"Let the little ones come unto Me."

I long for the joy of that glorious time,
The sweetest and brightest and best,
When the dear little children of every clime
Shall crowd to His arms and be blest.'),
(147, 'Christ upon the mountain peak
Stands alone in glory blazing;
Let us, if we dare to speak,
With the saints and angels praise Him:
Alleluia, Alleluia, Alleluia.

Trembling at His feet we saw
Moses and Elijah speaking;
All the prophets and the law
Shout thro''them their joyful greeting:
Alleluia, Alleluia, Alleluia.

Swift the cloud of glory came,
God proclaiming in the thunder
Jesus as His Son by name;
Nations cry aloud in wonder!
Alleluia, Alleluia, Alleluia.

This is God''s beloved Son:
Law and prophets fade before Him;
First and last, the only One,
Let creation now adore Him.
Alleluia, Alleluia, Alleluia.'),
(148, 'O love, how deep, how broad, how high,
Beyond all thought and fantasy,
That God, the Son of God, should take
Our mortal form for mortal''s sake!

For us baptized, for us He bore
His holy fast and hungered sore;
For us temptation sharp He knew;
For us the tempter over threw.

For us by wickedness betrayed,
For us, in crown of thorns arrayed,
He bore the shameful cross and death;
For us He gave His dying breath.

For us He rose from death again,
For us He went on high to reign;
For us He sent His Spirit here
To guide, to strengthen, and to cheer.

All glory to our Lord and God
For love so deep, so high, so broad;
The Trinity whom we adore
Forever and forevermore.'),
(149, 'Once in royal David''s city
Stood a lowly cattle shed,
Where a mother laid her Baby
In a manger for His bed;
Mary was that mother mild,
Jesus Christ her little Child.

He came down to earth from heaven,
Who is God and Lord of all,
And His shelter was a stable,
And His cradle was a stall;
With the poor, and mean, and lowly,
Lived on earth our Savior holy.

And through all His wondrous childhood
He would honor and obey,
Love and watch the lowly mother
In whose gentle arms He lay.
Christian children all must be
Mild, obedient, good as He.

And our eyes at last shall see Him,
Through His own redeeming love;
For that Child so dear and gentle
Is our Lord in heaven above;
And He leads His children on
To the place where He is gone.'),
(150, 'Who is He in yonder stall,
At whose feet the shepherds fall?

Refrain:
''Tis the Lord, O wondrous story,
''Tis the Lord, the King of glory!
At His feet we humbly fall,
Crown Him, crown Him Lord of all.
At His feet we humbly fall- the Lord of all.
Crown Him, crown Him, Jesus, Jesus,
Crown Him Lord of all.

Who is He in deep distress,
Fasting in the wilderness?

Who is He, the gathering throng
Greet with loud triumphant song?

Lo, at midnight, who is He
Prays in dark Gethsemane?

Who is He on yonder tree
Dies in shame and agony?

Who is He that from the grave
Comes to heal and help and save?

Who is He that from His throne
Rules through all the world alone?'),
(151, 'Jesus walked this lonesome valley;
He had to walk it by Himself.
O nobody else could walk it for Him.
He had to walk it by Himself.

I must go and stand my trial.
I have to stand it by myself.
O nobody else could stand it for me.
I have to stand it by myself.

Jesus walked this lonesome valley;
He had to walk it by Himself.
O nobody else could walk it for Him.
He had to walk it by Himself.'),
(152, 'Tell me the story of Jesus,
Write on my heart every word.
Tell me the story most precious,
Sweetest that ever was heard.
Tell how the angels in chorus,
Sang as they welcomed His birth.
"Glory to God in the highest!
Peace and good tidings to earth."

Refrain:
Tell me the story of Jesus,
Write on my heart every word.
Tell me the story most precious,
Sweetest that ever was heard.

Fasting alone in the desert,
Tell of the days that are past.
How for our sins He was tempted,
Yet was triumphant at last.
Tell of the years of His labor,
Tell of the sorrow He bore.
He was despised and afflicted,
Homeless, rejected and poor.

Tell of the cross where they nailed Him,
Writhing in anguish and pain.
Tell of the grave where they laid Him,
Tell how He liveth again.
Love in that story so tender,
Clearer than ever I see.
Stay, let me weep while you whisper,
Love paid the ransom for me.'),
(153, 'Prince of Peace, control my will,
Bid this struggling heart be still;
Bid my fears and doubtings cease,
Hush my spirit into peace.

Thou hast bought me with Thy blood,
Opened wide the gate to God;
Peace, I ask, but peace must be,
Lord, in being one with Thee.

May Thy will, not mine, be done,
May Thy will and mine be one;
Chase these doubtings from my heart,
Now Thy perfect peace impart.'),
(154, 'When I survey the wondrous cross
on which the Prince of Glory died;
my richest gain I count but loss,
and pour contempt on all my pride.

Forbid it, Lord, that I should boast,
save in the death of Christ, my God;
all the vain things that charm me most,
I sacrifice them to his blood.

See, from his head, his hands, his feet,
sorrow and love flow mingled down.
Did e''er such love and sorrow meet,
or thorns compose so rich a crown.

Were the whole realm of nature mine,
that were an offering far too small;
love so amazing, so divine,
demands my soul, my life, my all.'),
(155, 'When I survey the wondrous cross
On which the Prince of glory died,
My richest gain I count but loss,
And pour contempt on all my pride.

See, from His head, His feet,
Sorrow and love flow mingled down;
Did e''er such love and sorrow meet?
Or thorns compose so rich a crown?

Since I, who was undone and lost,
Have pardon through His name and word;
Forbid it, then, that I should boast,
Save in the cross of Christ my Lord.

Were the whole realm of nature mine,
That were a tribute far too small;
Love so amazing, so divine,
Demands my life, my soul, my all.'),
(156, 'O sacred Head, now wounded,
with grief and shame weighed down,
now scornfully surounded
with thorns, thine only crown:
how pale thou art with anguish,
with sore abuse and scorn!
How does that visage languish
which once was bright as morn!

What thou, my Lord, has suffered
was all for sinners'' gain;
mine, mine was the transgression,
but thine the deadly pain.
Lo, here I fall, my Savior!
''Tis I deserve thy place;
look on me with thy favor,
vouchsafe to me thy grace.

What language shall I borrow
to thank thee, dearest friend,
for this thy dying sorrow,
thy pity without end?
O make me thine forever;
and should I fainting be,
Lord, let me never, never
outlive my love for thee.'),
(157, 'Go to dark Gethsemane,
Ye who feel the tempter''s power
Your Redeemer''s conflict see.
Watch with him one bitter hour;
Turn not from his griefs away;
Learn from Jesus Christ to pray.

See Him at the judgment hall,
Beaten, bound, reviled, arraigned;
See Him meekly bearing all;
Love to man His soul sustained!
Shun not suffering, shame, or loss;
Learn from him to bear the cross.

Calvary''s mournful mountain climb;
There, adoring at his feet,
Mark that miracle of time,
God''s own sacrifice complete.
"It is finished!" hear him cry;
Learn from Jesus Christ to die.'),
(158, 'Were you there when they crucified my Lord?
Were you there when they crucified my Lord?
O! Sometimes it causes me to tremble, tremble, tremble.
Were you there when they crucified my Lord?

Were you there when they nailed Him to the tree?
Were you there when they nailed Him to the tree?
O! Sometimes it causes me to tremble, tremble, tremble.
Were you there when they nailed Him to the tree?

Were you there when they pierced Him in the side?
Were you there when they pierced Him in the side?
O! Sometimes it causes me to tremble, tremble, tremble.
Were you there when they pierced Him in the side?

Were you there when the sun refused to shine?
Were you there when the sun refused to shine?
O! Sometimes it causes me to tremble, tremble, tremble.
Were you there when the sun refused to shine?

Were you there when they laid Him in the tomb?
Were you there when they laid Him in the tomb?
O! Sometimes it causes me to tremble, tremble, tremble.
Were you there when they laid Him in the tomb?'),
(159, 'On a hill far away stood an old rugged cross,
the emblem of suffering and shame;
and I love that old cross where the dearest and best
for a world of lost sinners was slain.

Refrain:
So I''ll cherish the old rugged cross,
till my trophies at last I lay down;
I will cling to the old rugged cross,
and exchange it some day for a crown.

O that old rugged cross, so despised by the world,
has a wondrous attraction for me;
for the dear Lamb of God left his glory above
to bear it to dark Calvary.

To that old rugged cross I will ever be true,
its shame and reproach gladly bear;
then he''ll call me some day to my home far away,
where his glory forever I''ll share.'),
(160, 'Ride on! ride on in majesty!
Hark, all the tribes hosanna cry;
O Savior meek, pursue Thy road
With palms and scattered garments strowed.

Ride on! ride on in majesty!
In lowly pomp ride on to die;
O Christ, Thy triumphs now begin
O''er captive death and conquered sin.

Ride on! ride on in majesty!
The winged squadrons of the sky
Look down with sad and wondering eyes
To see the approaching sacrifice.

Ride on! ride on in majesty!
In lowly pomp ride on to die;
Bow Thy meek head to mortal pain,
Then take, O God, Thy power and reign.'),
(161, 'Throned upon the awful tree,
Lamb of God, Your grief we see.
Darkness veils Your anguished face;
None its lines of woe can trace.
None can tell what pangs unknown
Hold You silent and alone.

Silent through those three dread hours,
Wrestling with the evil powers,
Left alone with human sin,
Gloom around You and within,
Till th''appointed time is nigh,
Till the Lamb of God may die.

Hark, that cry that peals aloud
Upward through the whelming cloud!
You, the Father''s only Son,
You, His own anointed one,
You are asking- can it be?
"Why have You forsaken Me?"

Lord, should fear and anguish roll
Darkly o''er our sinful soul,
You, who once were thus bereft
That Your own might ne''er be left,
Teach us by that bitter cry
In the gloom to know You nigh.'),
(162, 'What wondrous love is this, O my soul, O my soul?
What wondrous love is this,
O my soul? What wondrous love is this
That caused the Lord of bliss
To bear the dreadful curse for my soul, for my soul;
To bear the dreadful curse for my soul

To God and to the Lamb I will sing,
I will sing; To God and to the Lamb,
I will sing; To God and to the Lamb
Who is the great I am, While millions join the theme,
I will sing, I will sing; While millions join the theme, I will sing.

And when from death I''m free, I''ll sing on, I''ll sing on;
And when from death I''m free, I''ll sing on;
And when from death I''m free,
I''ll sing and joyful be, And through eternity
I''ll sing on, I''ll sing on! And through eternity, I''ll sing on'),
(163, 'Alas! and did my Savior bleed,
and did my Sovereign die?
Would he devote that sacred head
for sinners such as I?

Refrain:
At the cross, at the cross,
where I first saw the light,
and the burden of my heart rolled away;
it was there by faith I received my sight,
and now I am happy all the day!

Was it for crimes that I have done,
he groaned upon the tree?
Amazing pity! Grace unknown!
And love beyond degree!

But drops of grief can ne''er repay
the debt of love I owe:
Here, Lord, I give myself away;
''tis all that I can do!'),
(164, 'There is a green hill far away,
Without a city wall,
Where the dear Lord was crucified,
Who died to save us all.

We may not know, we cannot tell,
What pains He had to bear,
But we believe it was for us
He hung and suffered there.

He died that we might be forgiven,
He died to make us good,
That we might go at last to heaven,
Saved by His precious blood.

There was no other good enough
To pay the price of sin;
He only could unlock the gate
Of heaven, and let us in.

O dearly, dearly has He loved!
And we must love Him too,
And trust in His redeeming blood,
And try His works to do.'),
(165, 'Look, you saints, the sight is glorious,
See the Man of sorrows now;
From the fight returned victorious,
Every knee to Him shall bow.
Crown Him! Crown Him! Crown Him!
Crown Him! Crown Him! Crown Him!
Crowns become the victor''s brow.
Crowns become the victor''s brow.

Crown the Savior! angels crown Him!
Rich the trophies Jesus brings;
On the seat of power enthrone Him
While the vault of heaven rings.
Crown Him! Crown Him! Crown Him!
Crown Him! Crown Him! Crown Him!
Crown the Savior, King of Kings.
Crown the Savior, King of Kings.

Sinners in derision crowned Him,
Mocking thus the Savior''s claim;
Saints and angels crowd around Him,
Own His title, praise His name.
Crown Him! Crown Him! Crown Him!
Crown Him! Crown Him! Crown Him!
Spread abroad the victor''s fame!
Spread abroad the victor''s fame!

Hark! those bursts of acclamation!
Hark! those loud triumphant chords!
Jesus takes the highest station;
Oh, what joy the sight affords!
Crown Him! Crown Him! Crown Him!
Crown Him! Crown Him! Crown Him!
King of kings and Lord of lords!
King of kings and Lord of lords!'),
(166, 'Christ the Lord is risen today, Alleluia!
Sons of man and angels say, Alleluia!
Raise your joys and triumphs high, Alleluia!
Sing, ye heavens, and earth reply, Alleluia!

Lives again our glorious King, Alleluia!
Where, O death, is now thy sting? Alleluia!
Once he died our souls to save, Alleluia!
Where''s thy victory, boasting grave? Alleluia!

Love''s redeeming work is done, Alleluia!
Fought the fight, the battle won, Alleluia!
Death in vain forbids him rise, Alleluia!
Christ has opened paradise, Alleluia!

Soar we now where Christ has led, Alleluia!
Following our exalted Head, Alleluia!
Made like him, like him we rise, Alleluia!
Ours the cross, the grave, the skies, Alleluia!'),
(167, 'Alleluia! sing to Jesus! His the scepter, His the throne.
Alleluia! His the triumph, His the victory alone.
Hark! the songs of peaceful Zion thunder like a mighty flood.
Jesus out of every nation has redeemed us by His blood.

Alleluia! not as orphans are we left in sorrow now;
Alleluia! He is near us, faith believes, nor questions how;
Though the cloud from sight received Him when the forty days were o''er
Shall our hearts forget His promise, "I am with you evermore"?

Alleluia! bread of angels, Thou on earth our food, our stay;
Alleluia! here the sinful flee to Thee from day to day:
Intercessor, Friend of sinners, Earth''s Redeemer, plead for me,
Where the songs of all the sinless sweep across the crystal sea.'),
(168, 'And have the bright immensities
Received our risen Lord,
Where light years frame the Pleiades
And point Orion''s sword?
Do flaming suns His footsteps trace
Thro''corridors sublime,
The Lord of inter stellar space
And conqueror of time?

The heav''n that hides Him from our sight
Knows neither near nor far;
A little candle sheds its light
As surely as a star.
And where His loving people meet
To share the gift divine,
There stands He with unhurrying feet;
There heav''nly splendors shine.'),
(169, 'Come, you faithful, raise the strain
Of triumphant gladness;
God has brought His people
Now rejoice, Jerusalem,
And with true affection
Welcome in unwearied strains
Jesus''resurrection.

''Tis the spring of souls today;
Christ has burst His prison
From the frost and gloom of death
light and life have risen
All the winter of our sins,
Long and dark, is flying
From His ligth, to whom we give
Thanks and praise undying.

"Alleluia!" now we cry
to our King immortal,
Who, triumphant, burst the
bars of the tomb''s dark portal
"Alleluia!" with the Son,
God the Father praising;
"Alleluia!" yet again to
the Spirit raising.'),
(170, 'Come, you faithful, raise the strain
Of triumphant gladness;
God has brought His Israel
Into joy from sadness;
Loosed from Pharoah''s bitter yoke
Jacob''s sons and daughters;
Led them with unmoistened foot
Through the Red Sea waters.

''Tis the spring of souls today;
Christ has burst His prison,
And from three days''sleep in death
As a sun has risen;
All the winter of our sins,
Long and dark, is flying
From His light, to whom is giv''n
Laud and praise undying.

Now the queen of seasons, bright
With the day of splendor,
With the royal feast of feasts,
Comes its joy to render;
Comes to gladden faithful hearts
Which with true affection
Welcome in unwearied strain
Jesus''resurrection.

For today among the twelve
Christ appeared, be stowing
His deep peace, which evermore
Passes human knowing.
Neither could the gates of death,
Nor the tomb''s dark portal,
Nor the watchers, nor the seal,
Hold Him as a mortal.

"Alleluia!" now we cry
To our King immortal,
Who, triumphant, burst the bars
Of the tomb''s dark portal;
"Alleluia" with the Son,
God the Father praising;
"Alleluia!" yet again
To the Spirit raising.'),
(171, 'Thine is the glory, Risen, conquering Son;
Endless is the victory thou o''er death hast won.
Angels in bright raiment rolled the stone away,
Kept the folded grave-clothes where Thy body lay.

Refrain:
Thine is the glory, Risen, conquering Son;
Endless is the victory thou o''er death hast won.

Lo! Jesus meets us. Risen from the tomb,
Lovingly He greets us, Scatters fear and gloom;
Let His Church with gladness hymns of triumph sing,
For her Lord now liveth; Death has lost its sting.

No more we doubt Thee, Glorious Prince of life!
Life is nought without Thee; Aid us in our strife;
Make us more than conquerors through Thy deathless love
Bring us safe through Jordan to Thy home above.'),
(172, 'The strife is o''er, the battle done;
Now is the victor''s triumph won!
Now be the song of praise begun. Alleluia!

The pow''rs of death have done their worst,
But Christ their legions has dispersed.
Let shouts of holy joy outburst. Alleluia!

The three sad days have quickly sped,
He rises glorious from the dead.
All glory to our risen head! Alleluia!

Lord, by the stripes which wounded You,
From death''s sting free Your servants too,
That we may live and sing to You. Alleluia!'),
(173, 'Good Christian friends, rejoice and sing!
Now is the triumph of our King!
To all the world glad news we bring:
Alleluia! Alleluia! Alleluia!

The Lord of life is risen for aye;
Bring flowers of song to strew His way;
Let all mankind rejoice and say:
Alleluia! Alleluia! Alleluia!

Praise we in songs of victory
That love, that life which cannot die,
And sing with hearts uplifted high:
Alleluia! Alleluia! Alleluia!

Thy name we bless, O risen Lord,
And sing today with one accord
The life laid down, the life restored:
Alleluia! Alleluia! Alleluia!'),
(174, 'Star of our hope! He''ll soon appear,
The last loud trumpet speaks Him near;
Hail Him, all saints, from pole to pole-
How welcome to the faithful soul!

From heaven angelic voices sound:
Behold the Lord of glory crowned,
Arrayed in majesty divine,
And in His highest glories shine.

The grave yields up its precious trust,
Which long has slumbered in the dust,
Resplendent forms ascending, fair,
Now meet the Savior in the air.

Descending with His azure throne,
He claims the kingdom for His own;
The saints rejoice, they shout, they sing,
And hail Him their triumphant King.'),
(175, 'Now the green blade rises from the buried grain,
What that in dark earth many days has lain;
Love lives again, that with the dead has been;
Love is come again like wheat arising green.

In the grave they laid Him, love by hatred slain,
Thinking that He would never wake again,
Laid in the earth like grain that sleeps unseen;
Love is come again like wheat arising green.

Forth He came in triumph, like the risen grain,
He that for three days in the grave had lain;
Raised from the dead, my living Lord is seen;
Love is come again like wheat arising green.

When our hearts are wintry, grieving, or in pain,
Your touch can call us back to life again,
Field of our hearts that dead and bare have been;
Love is come again like wheat arising green.'),
(176, 'Hail the day that sees Him rise, Alleluia!
Glorious to His native skies; Alleluia!
Christ, awhile to mortals giv''n, Alleluia!
Enters now the highest heav''n! Alleluia!

There the glorious triumph waits; Alleluia!
Lift your heads, eternal gates! Alleluia!
Wide unfold the radiant scene; Alleluia!
Take the King of glory in! Alleluia!

See! He lifts His hands above; Alleluia!
See! He shows the prints of love: Alleluia!
Hark! His gracious lips bestow, Alleluia!
Blessings on His Church below. Alleluia!

Lord beyond our mortal sight, Alleluia!
Raise our hearts to reach Thy height, Alleluia!
There Thy face unclouded see, Alleluia!
Find our heav''n of heav''ns in Thee. Alleluia!'),
(177, 'Jesus, your blood and righteousness
My beauty are, my glorious dress;
Mid flaming worlds, in these arrayed,
With joy shall I lift up my head.

Bold shall I stand in that great day,
Cleansed and redeemed, no debt to pay;
For by your cross absolved I am
From sin and guilt, from fear and shame.

Lord, I believe your precious blood,
Which at the mercy seat of God
Pleads for the captives'' liberty,
Was also shed in love for me.

When from the dust of death I rise
To claim my mansion in the skies,
This then shall be my only plea:
Christ Jesus lived and died for me.'),
(178, 'Once our blessed Christ of beauty
Was veiled off from human views;
But through suffering, death, and sorrow
He has rent the veil in two.

Refrain:
O behold the Man of Sorrows!
O behold Him in plain view!
Lo! He is the mighty Conqueror
Since He rent the veil in two;
Lo! He is the mighty Conqueror
Since He rent the veil in two.

Yes, He is with God, the Father,
Interceding there for you;
For He is the Well beloved
Since He rent the veil in two.

Holy angels bow before Him,
Men of earth give praises due;
For He is the mighty Conqueror
Since He rent the veil in two.'),
(179, 'The wonders of redeeming love
Our highest thoughts exceed;
The Son of God comes from above
For sinful man to bleed.

He gives Himself, His life, His all,
A sinless sacrifice.
For man He drains the cup of gall,
For man the victim dies.

And now before His Father''s face
His precious blood He pleads;
For those who seek the throne of grace
His lovee still intercedes.

He knows the frailties of our frame,
For He has borne our grief;
Our great High Priest once felt the same,
And He can send relief.

His love will not be satisfied,
Till He in glory sees
The faithful ones for whom He died
From sin forever free.'),
(180, 'O listen to our wondrous story,
Counted once among the lost;
Yet One came down from heaven''s glory,
Saving us at awful cost!

Refrain:
Who saved us from eternal loss?
Who but God''s Son upon the cross?
What did He do? He died for you!
Where is He now? Believe it thou,
In heaven interceding! In heaven interceding!

No angel could His place have taken,
Highest of the high tho'' he;
The loved One on the cross forsaken
Was One of the Godhead three!

Will you surrender to this Savior?
To His scepter humbly bow?
You, too, shall come to know His favor,
He will save you, save you now.'),
(181, 'Does Jesus care when my heart is pained
Too deeply for mirth and song;
As the burdens press, and the cares distress,
And the way grows weary and long?

Refrain:
O yes, He cares- I know He cares!
His heart is touched with my grief;
When the days are weary,
The long nights dreary,
I know my Savior cares. (He cares.)

Does Jesus care when my way is dark
With a nameless dread and fear?
As the daylight fades into deep night shades,
Does He care enough to be near?

Does Jesus care when I''ve said goodbye
To the dearest on earth to me,
And my sad heart aches till it nearly breaks ''
Is it aught to Him? Does He see?'),
(182, 'Christ is alive!
Let Christians sing.
His cross stands empty to the sky.
Let streets and homes with praises ring.
His love in death shall never die.

Christ is alive!
No longer bound
To distant years in Palestine,
He comes to claim the here and now
And conquer every place and time.

In every insult,
rift, and war
Where color, scorn or wealth divide,
He suffers still, yet loves the more,
And lives, though ever crucified.

Christ is alive!
Ascended Lord
He rules the world His Father made,
Till, in the end, His love adored
Shall be to all on earth displayed.'),
(183, 'I Will sing of Jesus love,
Sing of Him,who first loved me;
for He left bright worlds above,
And died on Calvary.

Refrain:
I will sing of Jesus love
Endless praise my heart shall give;
He has died that I might live
I will sing His love to me.

O the depths of love divine!
Earth or heaven can never know
How that sin as dark as mine
can be made as white as snow.

Nothing good for Him I''ve done;
How could He such love bestow?
Lord, I own my heart is won,
help me now my love to show.'),
(184, 'I hear the Savior say,
"Thy strength indeed is small;
Child of weakness, watch and pray,
Find in Me thine all in all."

Refrain:
Jesus paid it all,
All to Him I owe;
Sin had left a crimson stain,
He washed it white as snow.

Lord, now indeed I find
Thy power and Thine alone,
Can change the leper''s spots
And melt the heart of stone.

Since nothing good have I
Whereby Thy grace to claim,
I''ll wash my garments white
In the blood of Calv''ry''s Lamb.

And when before the throne
I stand in Him complete,
I''ll lay my trophies down
All down at Jesus'' feet.'),
(185, 'Jesus is all the world to me,
my life, my joy, my all;
he is my strength from day to day,
without him I would fall.
When I am sad, to him I go,
no other one can cheer me so;
when I am sad, he makes me glad,
he''s my friend.

Jesus is all the world to me,
my friend in trials sore;
I go to him for blessings, and
he gives them o''er and o''er.
He sends the sunshine and the rain,
he sends the harvest''s golden grain;
sunshine and rain, harvest of grain,
he''s my friend.

Jesus is all the world to me,
and true to him I''ll be;
O how could I this friend deny,
when he''s so true to me?
Following him I know I''m right,
he watches o''er me day and night;
following him by day and night,
he''s my friend.

Jesus is all the world to me,
I want no better friend;
I trust him now, I''ll trust him when
life''s fleeting days shall end.
Beautiful life with such a friend,
beautiful life that has no end;
eternal life, eternal joy,
he''s my friend.'),
(186, 'I''ve found a Friend; oh, such a Friend!
He loved me ere I knew Him;
He drew me with the cords of love,
And thus He bound me to Him.
And ''round my heart still closely twine
Those ties which nought can sever,
For I am His, and He is mine,
Forever and forever.

I''ve found a Friend; oh, such a Friend!
He bled, He died to save me;
And not alone the gift of life,
But His own self He gave me.
Nought that I have my own I call,
I hold it for the Giver;
My heart, my strength, my life my all,
Are His, and His forever.

I''ve found a Friend; oh, such a Friend!
All power to Him is given;
To guard me on my upward course,
And bring me safe to heaven.
The eternal glories gleam afar,
To nerve my faint endeavor;
So now to watch, to work, to war,
And then to rest forever.

I''ve found a Friend; oh, such a Friend!
So kind, and true, and tender,
So wise a counselor and guide,
So mighty a defender.
From Him, who loveth me so well,
What power my soul can sever?
Shall life or death, or earth, or hell?
No; I am His forever.'),
(187, 'Jesus! what a Friend for sinners!
Jesus! Lover of my soul;
Friends may fail me, foes assail me,
He, my Savior, makes me whole.

Refrain:
Hallelujah! what a Savior!
Hallelujah! what a Friend!
Saving, helping, keeping, loving,
He is with me to the end.

Jesus! what a Strength in weakness!
Let me hide myself in Him.
Tempted, tried, and sometimes failing,
He, my Strength, my victory wins.

Jesus! what a Help in sorrow!
While the billows over me roll,
Even when my heart is breaking,
He, my Comfort, helps my soul.

Jesus! I do now receive Him,
[or Jesus! I do now adore Him,]
More than all in Him I find.
He hath granted me forgiveness,
I am His, and He is mine.'),
(188, 'My song is love unknown,
My Savior''s love to me,
Love to the loveless shown,
That they might lovely be.
O who am I that for my sake
My Lord should take frail flesh and die?

He came from His blest throne,
Salvation to bestow,
But men made strange, and none
The longed for Christ would know.
But O my Friend, my Friend indeed
Who at my need His life did spend.

Sometimes they strew His way,
And His sweet praises sing,
Resounding all the day,
Hosannas to their King.
Then "Crucify" is all their breath,
And for His death they thirst and cry.

Why, what hath my Lord done?
What makes this rage and spite?
He made the lame to run,
He gave the blind their sight.
Sweet injuries! yet they at these
Themselves displease, and ''gainst Him rise.

They rise, and needs will have
My dear Lord made away;
A murderer they save,
The Prince of life they slay.
Yet cheerful He to suff''ring goes,
That He His foes from thence might free.

Here might I stay and sing,
No story so divine:
Never was love, dear King,
Never was grief like Thine!
This is my Friend, in whose sweet praise
I all my days could gladly spend.'),
(189, 'Who can cheer the heart like Jesus,
By His presence all divine?
True and tender, pure and precious,
Oh, how blest to call Him mine!

Refrain:
All that thrills my soul is Jesus;
He is more than life to me; (to me;)
And the fairest of ten thousand,
In my blessed Lord I see.

Love of Christ so freely given,
Grace of God beyond degree,
Mercy higher than the heaven,
Deeper than the deepest sea.

Every need His hand supplying,
Every good in Him I see;
On His strength divine relying,
He is All in All to me.

By the crystal flowing river
With the ransomed I will sing,
And forever and forever
Praise and glorify the King'),
(190, 'Jesus loves me! this I know,
For the Bible tells me so;
Little ones to Him belong
They are weak but He is strong

Refrain:
Yes, Jesus loves me!
Yes, Jesus loves me!
Yes, Jesus loves me!
The Bible tells me so.

Jesus loves me! He wo died
Heaven''s gate to open wide:
He will wash away my sin,
Let His little child come in.

Jesus, take this heart of mine,
Make it pure and wholly thine;
On the coross You died for me,
I will love and live for Thee.'),
(191, 'Love divine, all loves excelling,
joy of heaven, to earth come down;
fix in us thy humble dwelling;
all thy faithful mercies crown!
Jesus thou art all compassion,
pure, unbounded love thou art;
visit us with thy salvation;
enter every trembling heart.

Breathe, O breathe thy loving Spirit
into every troubled breast!
Let us all in thee inherit;
let us find the promised rest.
Take away our bent to sinning;
Alpha and Omega be;
end of faith, as its beginning,
set our hearts at liberty.

Come, Almighty to deliver,
let us all thy grace receive;
suddenly return and never,
nevermore thy temples leave.
Thee we would be always blessing,
serve thee as thy hosts above,
pray and praise thee without ceasing,
glory in thy perfect love.

Finish, then, thy new creation;
pure and spotless let us be.
Let us see thy great salvation
perfectly restored in thee;
changed from glory into glory,
till in heaven we take our place,
till we cast our crowns before thee,
lost in wonder, love, and praise.'),
(192, 'O Shepherd divine, I know Thou art mine;
Thy search in the night was for me.
This bleak world is cold, but warm is Thy fold;
My Shepherd, I follow Thee.
Thy beautiful lamp shineth bright o''er my way,
Thy glorious light unto Thy perfect day.
Thro'' pastures serene, Thro''valleys of green,
My Shepherd, I follow Thee.

O Shepherd divine, I know Thou art mine;
Thy great heart was broken for me.
Thy grace and Thy law I picture in awe;
They kissed upon Calvary.
Ah! life that was given to ransom my soul,
Ah! heart that was broken to make sinners whole,
This world is but loss In view of Thy cross,
My Shepherd, I follow Thee.

O Shepherd divine, I know Thou art mine;
I hear Thee say, "Follow thou Me."
Thy message today illumines my way;
The Spirit of Prophecy.
I thrill at Thy marvelous love to Thy sheep,
The way Thou dost lead to the still waters deep,
One staff and one rod, One fold and one God,
My Shepherd, I follow Thee.'),
(193, 'Savior, teach me day by day,
Love''s sweet lesson to obey,
Sweeter lesson cannot be,
Loving Him who first loved me.

With a child''s glad heart of love,
At Thy bidding may I move,
Prompt to serve and follow Thee,
Loving Him who first loved me.

Teach me I am not my own,
I am Thine, and Thine alone;
Thine to keep, to rule, to save
From all sin that would enslave.

Love in loving finds employ,
In obedience all her joy;
Ever new that joy will be,
Loving Him who first loved me.

Teach me thus Thy steps to trace,
Strong to follow in Thy grace.
Learning how to love from Thee,
Loving Him who first loved me.'),
(194, 'Sing we of the modern city,
Scene alike of joy and stress;
Sing we of its namelss people
In their urban wilderness.
Into endless rows of houses
Life is set a millionfold,
Life expressed in human beings
Daily born and growing old.

In the city full of people,
World of speed and hectic days,
In the everchanging setting
Of the latest trend and craze,
Christ is present, and among us;
In the crowd we see Him stand.
In the bustle of the city
Jesus Christ is every man.

God is not remote in heaven,
But on earth to share our shame,
Changing graph and mass and number
Into persons with a name.
Christ has shown, beyond statistics,
Human life with glory crowned,
By His timeless presence proving
People matter, people count!'),
(195, '"There shall be showers of blessing;"
This is the promise of love;
There shall be seasons refreshing,
Sent from the Savior above.

Refrain:
Showers of blessing,
Showers of blessing we need;
Mercy drops round us are falling,
But for the showers we plead.

"There shall be showers of blessing;"
Precious reviving again;
Over the hills and the valleys,
Sound of abundance of rain.

"There shall be showers of blessing;"
Send them upon us, O Lord;
Grant to us now a refreshing;
Come, and now honor Thy word.

"There shall be showers of blessing;"
O that today they might fall,
Now as to God were confessing,
Now as on Jesus we call!'),
(196, 'Tell me the old, old story of unseen things above,
Of Jesus and His glory, of Jesus and His love.
Tell me the story simply, as to a little child,
For I am weak and weary, and helpless and defiled.

Refrain:
Tell me the old, old story, tell me the old, old story,
Tell me the old, old story, of Jesus and His love.

Tell me the story softly, with earnest tones and grave;
Remember I''m the sinner whom Jesus came to save.
Tell me the story always, if you would really be,
In any time of trouble, a comforter to me.

Tell me the same old story when you have cause to fear
That this world''s empty glory is costing me too dear.
Yes, and when that world''s glory is dawning on my soul,
Tell me the old, old story: "Christ Jesus makes thee whole."'),
(197, 'The King of love my Shepherd is,
Whose goodness faileth never;
I nothing lack if I am His,
And He is mine forever.

Where streams of living water flow
My ransomed soul He leadeth,
And, where the verdant pastures grow,
With food celestial feedeth.

Perverse and foolish, oft I strayed,
But yet in love He sought me,
And on His shoulder gently laid,
And home, rejoicing, brought me.

And so through all the length of days
Thy goodness faileth never;
Good Shepherd! I would sing Thy praise
Within Thy house forever.'),
(198, 'And can it be that I should gain
an interest in the Savior''s blood!
Died he for me? who caused his pain!
For me? who him to death pursued?
Amazing love! How can it be
that thou, my God, shouldst die for me?

Refrain:
Amazing love! How can it be
that thou, my God, shouldst die for me?

He left his Father''s throne above
so free, so infinite his grace!;
emptied himself of all but love,
and bled for Adam''s helpless race.
''Tis mercy all, immense and free,
for O my God, it found out me!

Long my imprisoned sprit lay,
fast bound in sin and nature''s night;
thine eye diffused a quickening ray;
I woke, the dungeon flamed with light;
my chains fell off, my heart was free,
I rose, went forth, and followed thee.

No condemnation now I dread;
Jesus, and all in him, is mine;
alive in him, my living Head,
and clothed in righteousnes divine,
bold I approach th'' eternal throne,
and claim the crown, through Christ my own.'),
(199, 'The head that once was crowned with thorns
Is crowned with glory now;
A royal diadem adorns
The mighty victor''s brow.

The highest place that heaven affords
Is His, is His by right;
The King of kings, and Lord of lords,
And heaven''s eternal light.

The joy of all who dwell above,
The joy of all below,
To whom He manifests His love,
And grants His name to know.

To them the cross, with all its shame,
With all its grace is given;
Their name an everlasting name,
Their joy the joy of heaven.'),
(200, 'The Lord is coming, let this be
The herald note of jubilee;
And when we meet and when we part
The salutation from the heart.

Refrain:
The Lord is coming, let this be
The herald note of jubilee,
The herald note of jubilee.

The Lord is coming! sound it forth
From east to west, from south to north;
Speed on! speed on the tidings glad,
That none who love Him may be sad.

The Lord is coming, swift and sure
And all His judgments shall endure,
And none can hope to escape
His wrath, Who walk not in the narrow path.

This earth, with her ten thousand wrongs
Will soon be tuned to nobler songs;
Our praise shall then, in realms of light,
With all His universe unite.'),
(201, 'Christ is coming! let creation
Bid her groans and travail cease;
Let the glorious proclamation
Hope restore and faith increase;
Christ is coming! Christ is coming!
Come, Thou blessed Prince of Peace!
(Prince of Peace!)
Come, Thou blessed Prince of Peace!

Earth can now but tell the story
Of Thy bitter cross and pain;
She shall yet behold Thy glory
When Thou comest back to reign;
Christ is coming! Christ is coming!
Let each heart repeat the strain.
(repeat the strain)
Let each heart repeat the strain.

With that "blessed hope" before us,
Let no harp remain unstrung;
Let the mighty advent chorus
Onward roll from tongue to tongue:
Christ is coming! Christ is coming!
Come, Lord Jesus, quickly come!
(quickly come!)
Come, Lord Jesus, quickly come!'),
(202, 'Tell it to every kindred and nation,
Tell it far and near;
Earth''s darkest night will fade with the dawning,
Jesus will soon appear.

Refrain:
Hail Him the King of glory,
Once the Lamb for sinners slain;
Tell, tell the wondrous story,
"Jesus comes to reign."

Nations again in strife and commotion,
Warnings by the way;
Signs in the heavens, unerring omens,
Herald the glorious day.

Children of God look up with rejoicing;
Shout and sing His praise;
Bless''d are they who, waiting and watching,
Look for the dawning rays.'),
(203, 'This is the threefold truth
On which our faith depends;
And with this joyful cry
Worship begins and ends.

Refrain:
Christ had died! Christ has risen!
Christ will come again!

By this we are upheld
When doubt and grief assail
Our Christian fortitude
And only grace avails

This is the threefold truth
Which, if we hold it fast,
Changes the world and us
And brings us home at last.'),
(204, 'Come, thou long expected Jesus!
born to set thy people free;
from our fears and sins release us,
let us find our rest in thee.
Israel''s strength and consolation,
hope of all the earth thou art;
dear desire of every nation,
joy of every longing heart.

Born thy people to deliver,
born a child and yet a King,
born to reign in us forever,
now thy gracious kingdom bring.
By thine own eternal spirit
rule in all our hearts alone;
by thine all sufficient merit,
raise us to thy glorious throne.'),
(205, 'The golden morning is fast approaching;
Jesus soon will come
To take his faithful and happy children
to their promised home

Refrain:
O, we see the gleams of the golden morning
piercing thro'' this night of gloom!
O, see the gleams of the golden morning
that will burst the tomb.

The gospel summons will soon be carried
to the nations round;
The Bridegroom then will cease to tarry
and the trumpet sound.

Attended by all the shining angels,
Down the flaming sky
the Judge will come, and will take his people
where they will not die.

The lov''d of earth who have long been parted,
Meet in that glad day;
The tears of those who are broken hearted
shall be wiped away.'),
(206, 'Face to face with Christ my Savior,
Face to face, what will it be,
When with rapture I behold Him,
Jesus Christ, who died for me?

Refrain:
Face to face shall I behold Him,
Far beyond the starry sky;
Face to face in all His glory
I shall see Him by and by!

Only faintly now I see Him,
With the darkening veil between,
But a blessed day is coming,
When His glory shall be seen.

What rejoicing in His presence,
When are banished grief and pain;
When the crooked ways are straightened,
And the dark things shall be plain!

Face to face! oh, blissful moment!
Face to face to see and know;
Face to face with my Redeemer,
Jesus Christ, who loves me so.'),
(207, 'It may be at morn, when the day is awaking,
When sunlight through darkness and shadow is breaking,
That Jesus will come in the fullness of glory
To receive from the world His own.

Refrain:
O Lord Jesus, how long, how long
Ere we shout the glad song?
Christ returneth, Hallelujah!
Hallelujah! Amen, Hallelujah! Amen.

It may be at midday, it may be at twilight,
It may be, perchance, that the blackness of midnight
Will burst into light in the blaze of His glory,
When Jesus receives His own.

O joy! O delight! should we go without dying,
No sickness, no sadness, no dread, and no crying,
Caught up through the clouds with our Lord into glory,
When Jesus receives His own.'),
(208, 'There''ll be no dark valleys when Jesus comes,
There''ll be no dark valleys when Jesus comes,
There''ll be no dark valleys when Jesus comes,
To gather His loved ones home.

Refrain:
To gather His loved ones home,
To gather His loved ones home.
There''ll be no dark valleys when Jesus comes,
To gather His loved ones home.

There''ll be no more sorrow when Jesus comes,
There''ll be no more sorrow when Jesus comes,
There''ll be a happy tomorrow when Jesus comes,
To gather His loved ones home.

There''ll be songs of greeting when Jesus comes,
There''ll be songs of greeting when Jesus comes,
There''ll be songs of greeting when Jesus comes,
To gather His loved ones home.'),
(209, 'That glorious day is coming,
The hour is hastening on;
Its radiant light is nearing,
Far brighter than the sun;
In yonder clouds of heaven,
The Savior will appear,
And gather all His chosen,
To meet Him in the air.

The saints, then all victorious
Will go to meet their Lord;
An earth both bright and glorious,
Will then be their reward;
And God Himself there reigning,
Will wipe all tears away;
Nor clouds nor night remaining,
But one eternal day.

O Christian, keep from sleeping,
And let your love abound;
Be watchful, prayerful, faithful,
The trumpet soon will sound!
O sinner, hear the warning!
To Jesus quickly!
Then you, in that blest morning,
May meet Him in the sky!'),
(210, 'Wake, awake, for night is flying,
The watchmen on the heights are crying,
Awake, Jerusalem, arise!
Midnight''s solemn hour is tolling,
His chariot wheels are nearer rolling,
He comes; prepare, ye virgins wise.
Rise up with willing feet
Go forth, the Bridegroom meet; Alleluia!
Bear through the night your well-trimmed light,
Speed forth to join the marriage rite.

Zion hears the watchmen singing,
Her heart with deep delight is springing,
She wakes, she rises from her gloom;
Forth her Bridegroom comes, all-glorious,
In grace arrayed, by truth victorious;
Her Star is risen, her Light is come!
All hail, incarnate Lord,
Our crown, and our reward! Alleluia!
We haste along, in pomp and song,
And gladsome join the marriage throng.

Lamb of God, the heavens adore Thee,
And men and angels sing before Thee,
With harp and cymbal''s clearest tone.
By the pearly gates in wonder
We stand, and swell the voice of thunder,
That echoes round Thy dazzling throne.
No vision ever brought,
No ear hath ever caught,
Such bliss and joy;
We raise the song, we swell the throng,
To praise Thee ages all along.')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(211, 'Lo! He comes, with clouds descending,
Once for favored sinners slain;
Countless angels, Him attending,
Swell the triumph of His train:
Hallelujah! Hallelujah!
Jesus comes, and comes to reign.

Every eye shall now behold Him
Robed in dreadful majesty!
Those who set at nought and sold Him,
Pierced, and nailed Him to the tree,
Deeply wailing, Deeply wailing,
Shall the true Mesiah see!

When the solemn trump has sounded,
Heaven and earth shall flee away;
All who hate Him, must, confounded,
Hear the summons of that day-
"Come to judgment! Come to judgment!
Come to judgment! Come away!"

Yea, amen! let all adore Thee,
High on Thy eternal throne!
Savior, take the power and glory,
Make Thy righteous sentence known;
O come quickly, O come quickly,
Claim the kingdom for Thine own!'),
(212, '''Tis almost time for the Lord to come,
I hear the people say;
The stars of heaven are growing dim,
It must be the breaking of the day.

Refrain:
O it must be the breaking of the day!
O it must be the breaking of the day!
The night is almost gone,
The day is coming on;
O it must be the breaking of the day!

The signs foretold in the sun and moon,
In earth and sea and sky,
Aloud proclaim to all mankind,
The coming of the Master draweth nigh.

It must be time for the waiting church
To cast her pride away,
With girded loins and burning lamps,
To look for the breaking of the day.

Go quickly out in the streets and lanes
And in the broad highway,
And call the maimed, the halt, and blind,
To be ready for the breaking of the day.'),
(213, 'Lift up the trumpet, and loud let it ring:
Jesus is coming again!
Cheer up, ye pilgrims, be joyful and sing:
Jesus is coming again!

Refrain:
Coming again, coming again,
Jesus is coming again!

Echo it, hilltops; proclaim it, ye plains:
Jesus is coming again!
Coming in glory, the Lamb that was slain;
Jesus is coming again!

Heavings of earth, tell the vast, wondering throng:
Jesus is coming again!
Tempests and whirlwinds, the anthem prolong;
Jesus is coming again!

Nations are angry--by this we do know
Jesus is coming again!
Knowledge increases; men run to and fro;
Jesus is coming again!'),
(214, 'We have this hope that burns within our heart,
Hope in the coming of the Lord.
We have this faith that Christ alone imparts,
Faith in the promise of His Word.
We believe the time is here,
When the nations far and near
Shall awake, and shout and sing
Hallelujah! Christ is King!
We have this hope that burns within our heart,
Hope in the coming of the Lord.

We are united in Jesus Christ our Lord.
We are united in His love.
Love for the waiting people of the world,
People who need our Savior''s love.
Soon the heav''ns will open wide,
Christ will come to claim His bride,
All the universe will sing
Hallelujah! Christ is King!
We have this hope this faith, and God''s great love,
We are united in Christ.'),
(215, 'The King shall come when morning dawns
And light triumphant breaks,
When beauty gilds the eastern hills
And life to joy awakes.

Not as of old a little child,
To bear and fight and die,
But crowned with glory like the sun
That lights the morning sky.

O, brighter than the rising morn
When Christ, victorious, rose
And left the lonesome place of death,
Despite the rage of foes.

O, brighter than that glorious morn
Shall dawn upon our race
The day when Christ in splendor comes,
And we shall see His face.

The King shall come when morning dawns
And light and beauty brings.
Hail, Christ the Lord! Your people pray:
Come quickly, King of kings.'),
(216, 'When the trumpet of the Lord shall sound,
and time shall be no more,
And the morning breaks, eternal, bright and fair;
When the saved of earth shall gather
over on the other shore,
And the roll is called up yonder, I''ll be there.

Refrain:
When the roll is called up yonder,
When the roll is called up yonder,
When the roll is called up yonder,
When the roll is called up yonder, I''ll be there.

On that bright and cloudless morning,
when the dead in Christ shall rise,
And the glory of His resurection share;
When His chosen ones shall gather
to their home beyond the skies,
And the roll is called up yonder, I''ll be there.

Let us labor for the Master
from the dawn till setting sun,
Let us talk of all His wondrous love and care,
Then, when all of life is over,
and our work on earth is done,
And the roll is called up yonder I''ll be there.'),
(217, 'The church has waited long
Her absent Lord to see;
And still in loneliness she waits,
A friendless stranger she.

How long, O Lord our God,
Holy and true and good,
Wilt Thou not judge Thy suffering church,
Her sighs and tears and blood?

We long to hear Thy voice,
To see Thee face to face,
To share Thy crown and glory then,
As now we share Thy grace.

Come, Lord, and wipe away
The curse, the sin, the stain,
And make this blighted world of ours
Thine own fair world again.'),
(218, 'When He cometh, when He cometh
To make up His jewels,
All His jewels, precious jewels,
His loved and His own.

Refrain:
Like the stars of the morning,
His brightness adorning,
They shall shine in their beauty,
Bright gems for His crown.

He will gather, He will gather
The gems for His kingdom;
All the pure ones, all the bright ones,
His loved and His own.

Little children, little children,
Who love their Redeemer,
Are the jewels, precious jewels,
His loved and His own.'),
(219, 'When Jesus comes in glory,
As Lord and King of kings,
O what a wondrous story
The blessed Bible brings:
His face will shine like sunlight,
His head be white as snow,
His eyes like flaming firelight,
His feet like brass aglow.

His voice like rushing waters
Will reach with mighty sound
Into the deepest quarters
Of all creation round;
And at this wondrous greeting
The dead in Christ shall rise,
Their Lord and Savior meeting
In glory in the skies.

And we who are believing
And His appearing love,
Shall know we are receiving
His glory from above;
His resurrection power
Will raise us to the place
Where we that wondrous hour
Shall see Him face to face.

O hasten Thine appearing,
Thou bright and Morning Star!
Lord, may we soon be hearing
The trumpet sound afar;
Thy people all are yearning
To be Thy raptured bride,
And at Thine own returning
Be caught up to Thy side.'),
(220, 'When He comes, When He comes,
We shall see the Lord in glory
when He comes! As I read the gospel story,
We shall see the Lord in glory,
We shall see the Lord in glory when He comes!
With the alleluias ringing to the sky,
With the alleluias ringing to the sky,
As I read the gospel story,
We shall see the Lord in glory,
With the alleluias ringing to the sky!

When He comes, When He comes,
We shall hear the trumpet sounded,
when He comes! We shall hear the trumpet sounded,
See the Lord by saints surrounded,
We shall hear the trumpet sounded, when He comes!
With the alleluias ringing to the sky,
With the alleluias ringing to the sky,
We shall hear the trumpet sounded,
See the Lord by saints surrounded,
With the alleluias ringing to the sky!

When He comes, When He comes,
We shall all rise up to meet Him
when He comes! We shall all rise up to meet Him,
When He calls His own to greet Him
We shall all rise up to meet Him when He comes!
With the alleluias ringing to the sky,
With the alleluias ringing to the sky,
We shall all rise up to meet Him,
When He calls His own to greet Him,
With the alleluias ringing to the sky!'),
(221, 'Rejoice, the Lord is King! Your Lord and King adore!
Rejoice, give thanks, and sing and triumph evermore
Lift up your heart, lift up your voice!
Rejoice, again I say, rejoice!

Jesus, the Savior, reigns, The God of truth and love;
When He had purged our stains, He took His seat above
Lift up your heart, lift up your voice!
Rejoice, again I say, rejoice!

His kingdom cannot fail, He rules o''er earth and heaven
The keys of death and grave Are to our Jesus given
Lift up your heart, lift up your voice!
Rejoice, again I say, rejoice!

Rejoice in glorious hope! Our Lord the judge shall come,
And take His servants up To their eternal home
Lift up your heart, lift up your voice!
Rejoice, again I say, rejoice!'),
(222, 'Hark! ten thousand harps and voices
Sound the note of praise above;
Jesuse reigns, and heaven rejoices,
Jesus reigns, the God of love:
See, He sits on yonder throne;
Jesus rules the world alone.
Alleluia! Alleluia!
Alleluia! Amen.

King of glory, reign forever,
Thine an everlasting crown;
Nothing from Thy love shall sever
Those whom Thou hast made Thine own;
Happy objects of Thy grace,
Destined to behold Thy face.
Alleluia! Alleluia!
Alleluia! Amen.

Savior, hasten Thine appearing;
Bring, O bring the glorious day,
When, the awful summons hearing,
Heaven and earth shall pass away:;
Then, with golden harps we''ll sing,
"Glory, glory to our King!"
Alleluia! Alleluia!
Alleluia! Amen.'),
(223, 'Crown him with many crowns,
the Lamb upon his throne,
Hark! how the heavenly anthem drowns
all music but its own.
Awake, my soul, and sing
of him who died for thee,
and hail him as thy matchless King
through all eternity.

Crown him the Lord of love!
behold his hands and side,
those wounds, yet visible above,
in beauty glorified;
No angel in the sky
Can fully bear that sight,
But downward bend his wondering eye
At mysteries so great.

Crown him the Lord of peace!
whose power a scepter sways
from pole to pole, that wars may cease,
and all be prayer and praise.
His reign shall know no end,
and round his pierced feet
fair flowers of paradise extend
their fragrance ever sweet.

Crown him the Lord of years;
The potentate of time,
Creator of the rolling spheres,
Ineffably sublime!
All hail, Redeemer, hail!
For thou hast died for me;
thy praise shall never, never fail
throughout eternity.'),
(224, 'Seek ye first the kingdom, ''Tis your Father''s will.
So the voice of Jesus bids us follow still.
Savior, we would hear Thee, Follow, find, and see;
And in life''s adventure Thy disciples be.

As for hidden treasure, Or for matchless pearl,
When at last discovered, some will sell their all:
So, when breaks the vision of that kingdom fair,
Ours shall be its riches and its beauty rare.

As the silent leaven works its secret way,
Or as grows the seed grain through the night and day;
Lord, so be the increase, peaceable but sure,
Of Thy word within us, And Thy kingdom''s power.

As the tender seedling grows up tall and strong,
And the birds of heaven to its branches throng;
So shall all God''s children, from the east and west,
Gather to His kingdom, In its shadow rest.

Humblest shall be greatest, poor in spirit reign;
Home shall come the childlike, born through Thee again
Eager hearts arrive there on the pilgrim''s road,
Hail! the kingdom glorious of the living God!'),
(225, 'God is working His purpose out
As year suceeds to year;
God is working His purpose out,
And the time is drawing near;
Nearer and nearer draws the time,
The time that shall surely be
When the earth shall be filled with the glory of God
As the waters cover the sea.

From utmost east to utmost west,
Where''er man''s foot hath trod,
By the mouth of many messengers
Goes forth the voice of God;
Give ear to me, ye confinents,
Ye isles, give ear to me,
That the earth shall be filled with the glory of God
As the waters cover the sea.

March we forth in the strength of God
With the banner of Christ unfurled,
That the light of the glorious gospel of truth
May shine throughout the world:
Fight we the fight with sorrow and sin
To set their captives free,
That the earth shall be filled with the glory of God
As the waters cover the sea.

All we can do is nothing worth
Unless God blesses the deed;
Vainly we hope for the harvest tide
Till God gives life to teh seed;
Yet nearer and nearer draws the time,
The time that shall surely be,
When the earth shall be filled with the glory of God
As the waters cover the sea.'),
(226, 'Lift up your heads, ye mighty gates!
Behold the King of glory waits;
The King of kings is drawing near,
The Savior of the world is here.

The Lord is just, a helper tried;
Mercy is ever at His side;
His kingly crowns is holiness,
His scepter, pity in distress.

O blest the land, the city blest,
Where Christ the Ruler is confessed!
O happy hearts and happy homes
To whom this King in triumph comes!

Fling wide the portals of your heart;
Make it a temple, set apart
From earthly use for heaven''s employ,
Adorned with prayer, and love, and joy.

Redeemer, come; I open wide
My heart to Thee; here, Lord, abide.
Let me Thy inner presence feel,
Thy grace and love in me reveal.'),
(227, 'Jesus shall reign where''er the sun
Does his successive journeys run;
His kingdom stretch from shore to shore,
Till moons shall wax and wane no more.

People and realms of ev''ry tongue
Dwell on His love with sweetest song,
And infant voices shall proclaim
Their early blessings on His name.

Blessings abound wherever He reigns;
The prisoner leaps to lose his chains;
The weary find eternal rest,
And all who suffer want are blessed.

Let every creature rise and bring
Honors peculiar to our King;
Angels descend with songs again,
And earth repeat the loud amen!'),
(228, 'A hymn of glory let us sing;
New hymns thro''-out the world shall ring
Alleluia! Alleluia!
Christ, by a road before untrod,
Ascends unto the throne of God.
Alleluia! Alleluia!
Alleluia, alleluia, alleluia!

O Lord, our homeward pathway bend,
That our unwearied hearts ascend.
Alleluia! Alleluia!
Where, seated on Your Father''s throne,
You reign as King of kings alone.
Alleluia! Alleluia!
Alleluia, alleluia, alleluia!

Give us Your joy on earth, O Lord,
In heav''n to be our great reward.
Alleluia! Alleluia!
When throned with You forever, we
Shall praise Your name eternally.
Alleluia! Alleluia!
Alleluia, alleluia, alleluia!

O risen Christ, ascended Lord,
All praise to you let earth accord:
Alleluia! Alleluia!
You are, while endless ages run,
With Father and with Spirit one.
Alleluia! Alleluia!
Alleluia, alleluia, alleluia!'),
(229, 'All hail the power of Jesus'' name! Let angels prostrate fall;
Bring forth the royal diadem, and crown Him Lord of all.
Bring forth the royal diadem, and crown Him Lord of all.

Ye chosen seed of Israel''s race, ye ransomed from the fall,
Hail Him who saves you by His grace, and crown Him Lord of all.
Hail Him who saves you by His grace, and crown Him Lord of all.

Let every kindred, every tribe on this terrestrial ball
To Him all majesty ascribe, and crown Him Lord of all.
To Him all majesty ascribe, and crown Him Lord of all.

O that with yonder angel throng we at His feet may fall!
We''ll join the everlasting song, and crown Him Lord of all.
We''ll join the everlasting song, and crown Him Lord of all.'),
(230, 'All glory, laud, and honor,
to thee, Redeemer, King,
to whom the lips of children
made sweet hosannas ring.
Thou art the King of Israel,
thou David''s royal Son,
who in the Lord''s name comest,
the King and Blessed One.

The company of angels
are praising thee on high,
and we with all creation
in chorus make reply.
The people of the Hebrews
with psalms before thee went;
our prayer and praise and anthems
before thee we present.

To thee, before thy passion,
they sang their hymns of praise;
to thee, now high exalted,
our melody we raise.
Thou didst accept their praises;
accept the prayers we bring,
who in all good delightest,
thou good and gracious King.'),
(231, 'Blest be the King whose coming
Is in the name of God!
For Him let doors be opened,
No hearts against Him barred!
Not robed in royal splendor,
In power and pomp comes He;
But clad as are the poorest,
Such His humility.

Blest be the King whose coming
Is in the name of God!
By those who truly listen
His voice is truly heard;
Pity the proud and haughty,
Who have not learned to heed
The Christ who is the promise,
Who has atonement made.

Blest be the King whose coming
Is in the name of God!
He only to the humble
Reveals the face of God.
All power is His, all glory!
All things are in His hand,
All ages and all peoples,
''Till time itself shall end.

Blest be the King whose coming
Is in the name of God!
He offers to the burdened
The rest and grace they need.
Gentle is He and humble!
And light his Yoke shall be,
For He would have us bear it,
So He can made us free!'),
(232, 'At the name of Jesus every knee shall bow,
Every tongue confess Him King of glory now;
"Tis the Father''s pleasure we should call Him Lord,
Who from the beginning was the mighty Word.

At His voice creation sprang at once to sight,
All the angel faces, All the hosts of light,
Thrones and dominations stars upon their way,
All the heavenly orders in their great array.

Humbled for a season, To receive a name
From the lips of sinners, Unto whom He came;
He is God the Savior, He is Christ the Lord,
Ever to be worshiped, Trusted and adored.

In your hearts enthrone Him: There let Him subdue
All that is not holy, All that is not true;
Crown Him as your captain in temptation''s hour,
Let His will enfold you in its light and power.

Surely, this Lord Jesus shall return again,
With His Father''s glory, With His angel train;
For all wreaths of empire meet upon His brow,
And our hearts confess Him King of glory now.'),
(233, 'Christ, whose glory fills the skies,
Christ, the true, the only light,
Sun of Righteousness, arise,
triumph o''er the shades of night;
Dayspring from on high, be near;
Daystar, in my heart appear.

Dark and cheerless is the morn
unaccompanied by thee;
joyless is the day''s return,
till thy mercy''s beams I see;
till they inward light impart,
cheer my eyes and warm my heart.

Visit then this soul of mine;
pierce the gloom of sin and grief;
fill me, Radiancy divine,
scatter all my unbelief;
more and more thyself display,
shining to the perfect day.'),
(234, 'Christ is the world''s Light,
He and none other; born in our darkness,
He became our brother.
If we have seen Him, we have seen the Father:
Glory to God on high!

Christ is the world''s Peace,
He and none other; no one can serve Him
and despise another.
Who else unites us one in God the Father?
Glory to God on high!

Christ is the world''sLife,
He and none other; sold once for silver,
murdered here, our broher,
He who redeems us reigns with God the Father.

Give God the glory,
God and none other; give God the glory,
Spirit, Son, and Father; give God the glory,
God in Man my brother; Glory to God on high!'),
(235, 'Christ is made the sure foundation,
Christ, our head and cornerstone,
Chosen of the Lord and precious,
Binding all the Church in one;
Holy Zion''s help forever
And our confidence alone.

To this temple where we call You,
Come, O Lord of hosts, and stay;
Come, with all Your loving kindness,
Hear Your people as they pray;
And Your fullest benediction
Shed within these walls today.

Grant, we pray to all Your faithful
All the gifts they ask to gain;
What they gain from You forever
With the blessed to retain;
And hereafter in Your glory
Evermore with You to reign.

Praise and honor to the Father,
Praise and honor to the Son,
Praise and honor to the Spirit,
Ever three and ever one:
One in might and one in glory
While unending ages run!'),
(236, 'I love Thee, I love Thee, I love Thee,my Lord;
I love Thee, my Savior, I love Thee, my God.
I love Thee, I love Thee, and that Thou dost know;
But how much I love Thee my actions will show.

I''m happy, I''m happy, O, wondrous account!
My joys are immortal, I stand on the mount!
I gaze on my treasure and long to be there,
With Jesus and angels, and kindred so dear.

O Jesus, my Savior, with Thee I am blest,
My life and salvation, my joy and my rest:
Thy name be my theme, and Thy love be my song;
Thy grace shall inspire both my heart and my tongue.

O, who''s like my Savior? He''s Salem''s bright King;
He smiles, and He loves me, and helps me to sing.
I''ll praise Him, I''ll praise Him, with notes loud and clear
While rivers of pleasure my spirit do cheer.'),
(237, 'In the cross of Christ I glory,
towering o''er the wrecks of time;
all the light of sacred story
gathers round its head sublime.

When the woes of life o''ertake me,
hopes deceive, and fears annoy,
never shall the cross forsake me.
Lo! it glows with peace and joy.

When the sun of bliss is beaming
light and love upon my way,
from the cross the radiance streaming
adds more luster to the day.

Bane and blessing, pain and pleasure,
by the cross are sanctified;
peace is there that knows no measure,
joys that through all time abide.'),
(238, 'How sweet the name of Jesus sounds
In a believer''s ear!
It soothes his sorrows, heals his wounds,
And drives away his fear.

It makes the wounded spirit whole,
And calms the troubled breast;
"Tis manna to the hungry soul,
And to the weary, rest.

Dear name, the rock on which I build,
My shield and hiding place,
My neverfailing treasury, filled
With boundless stores of grace.

Jesus! my Shepherd, Guardian, Friend,
My Prophet, Priest, and King!
My Lord, my life, my way, my end!
Accept the praise I bring.

Weak is the effort of my heart,
And cold my warmest thought;
But when I see Thee as Thou art,
I''ll praise Thee as I ought.'),
(239, 'Jesus, priceless Treasure, Source of purest pleasure, Truest Friend to me:
Ah! how long I''ve panted, And my heart has fainted, thirsting, Lord, for Thee.
Thine I am, O spotless Lamb, I will suffer naught to hide Thee,
Nought I ask beside Thee.

In Thine arms I rest me; foes who would molest me Cannot reach me here.
Though the earth be shaking, Every heart be quaking, Jesus calms our fear.
Sin and hell in conflict fell, With their bitter storms assail me,
Jesus will not fail me.

Hence, all thought of sadness! For the Lord of gladness, Jesus, enters in.
Those who love the Father, Though the storms may gather, still have peace within;
Yea, whatever we here must bear, Still in Thee lies purest pleasure,
Jesus, priceless Treasure!'),
(240, 'Fairest Lord Jesus, ruler of all nature,
O thou of God and man the Son!
Thee will I cherish, Thee will I honor,
thou, my soul''s glory, joy, and crown.

Fair are the meadows, fairer still the woodlands,
robed in the blooming garb of spring:
Jesus is fairer, Jesus is purer
who makes the woeful heart to sing.

Fair is the sunshine, fairer still the moonlight,
and all the twinkling starry host:
Jesus shines brighter, Jesus shines purer
than all the angels heaven can boast.

Beautiful Savior! Lord of all the nations,
Son of God and Son of Man!
Glory and honor, praise, adoration,
now and forevermore be thine!'),
(241, 'Jesus, the very thought of thee
with sweetness fills the breast;
but sweeter far thy face to see,
and in thy presence rest.

No voice can sing, no heart can frame,
Nor can the memory find
A sweeter sound than Jesus'' name,
The Savior of mankind.

O hope of every contrite heart!
O joy of all the meek,
to those who fall, how kind thou art!
How good to those who seek!

But what to those who find? Ah, this
nor tongue nor pen can show;
the love of Jesus, what it is,
none but his loved ones know.

Jesus, our only joy be thou,
as thou our prize wilt be;
Jesus, be thou our glory now,
and through eternity.'),
(242, 'Jesus, Thou joy of loving hearts!
Thou fount of life! Thou light of men!
From the best bliss that earth imparts,
We turn unfilled to Thee again.

Thy truth unchanged has ever stood;
Thou savest those that on Thee call;
To them that seek Thee Thou art good,
To them that find Thee, all in all.

We taste Thee, O Thou living Bread,
And long to feast upon Thee still;
We drink of Thee, the Fountainhead,
And thirst our souls from Thee to fill!

Our restless spirits yearn for Thee,
Where-e''r our changeful lot is cast;
Glad, when Thy gracious smile we see,
Blest, when our faith can hold Thee fast.

O Jesus, ever with us stay;
Make all our moments calm and bright;
Chase the dark night of sin away,
Shed o''r the world Thy holy light!'),
(243, 'King of glory, King of peace, I will love Thee;
And that love may never cease, I will move Thee.
Thou hast granted my request, Thou hast heard me;
Thou didst note my working breast, Thou hast spared me.

Wherefore with my utmost art I will sing Thee,
And the cream of all my heart I will bring Thee.
Though my sins against me cried, Thou didst clear me;
And alone, when they replied, Thou didst hear me.

Seven whole days, not one in seven, I will praise Thee;
In my heart, though not in heav''n I can raise Thee.
Small it is, in this poor sort to enroll Thee:
Ev''n eternity''s too short to extol Thee.'),
(244, 'My song shall be of Jesus;
His mercy crowns my days,
He fills my cup with blessings,
And tunes my heart to praise.
My song shall be of Jesus,
The precious Lamb of God,
Who gave Himself my ransom,
And bought me with His blood.

My song shall be of Jesus
When, sitting at His feet,
I call to mind His goodness
In meditation sweet:
My song shall be of Jesus,
Whatever ill betide;
I''ll sing the grace that saves me,
And keeps me at His side.

My song shall be of Jesus
While pressing on my way
To reach the blissful kingdom
Of pure and perfect day:
And when my soul shall enter
That realm of splendor fair,
A song of praise to Jesus
I''ll sing forever there.'),
(245, 'More about Jesus, I would know,
More of His grace to others show;
More of His saving fullness see,
More of His love who died for me.

Refrain:
More, more about Jesus,
More, more about Jesus;
More of His saving fullness see,
More of His love who died for me.

More about Jesus, let me learn,
More of His holy will discern;
Spirit of God, my teacher be,
Showing the things of Christ to me.

More about Jesus, in His word,
Holding communion with my Lord;
Hearing His voice in every line,
Making each faithful saying mine.

More about Jesus, on His throne,
Riches in glory all His own;
More of His kingdom''s sure increase,
More of His coming, Prince of Peace.'),
(246, 'Worthy, worthy is the Lamb,
Worthy, worthy is the Lamb,
Worthy, worthy is the Lamb,
That was slain.

Refrain:
Glory, hallelujah!
Praise Him, hallelujah!
Glory, hallelujah!
To the Lamb!

Savior, let Thy kingdom come!
Now the power of sin consume;
Bring Thy blest millennium,
Holy Lamb.

Thus may we
each moment feel,
Love Him, serve Him,
praise Him still,
Till we all on Zion''s hill
See the Lamb.'),
(247, 'There is a name I love to hear,
I love to sing its worth;
It sounds like music in my ear,
The sweetest name on earth.

Refrain:
O, how I love Jesus,
O, how I love Jesus,
O, how I love Jesus-
Because He first loved me!

It tells me of a Savior''s love,
Who died to set me free;
It tells me of His precious blood,
The sinner''s perfect plea.

It tells of One whose loving heart
Can feel my deepest woe,
Who in each sorrow bears a part
That none can bear below.'),
(248, 'There is a Name I love to hear,
I love to sing its worth;
It sounds like music in my ears,
The sweetest Name on earth.

Refrain:
O how I love Jesus,
O how I love Jesus,
O how I love Jesus,
Because He first loved me.

It tells me of a Savior''s love,
Who died to set me free;
It tells me of a Savior''s blood,
The sinners'' perfect plea.

It tells of one whose loving heart
Can feel my deepest woe;
Who in each sorrow bears
A part that none can bear below.'),
(249, 'Praise Him! praise Him! Jesus, our blessed Redeemer!
Sing, O Earth, His wonderful love proclaim!
Hail Him! hail Him! highest archangels in glory;
Strength and honor give to His holy Name!
Like a shepherd, Jesus will guard His children,
In His arms He carries them all day long:

Refrain:
Praise Him! Praise Him! Tell of His excellent greatness.
Praise Him! Praise Him! Ever in joyful song!

Praise Him! Praise Him! Jesus, our blessed Redeemer!
For our sins He suffered, and bled, and died.
He our Rock, our hope of eternal salvation,
Hail Him! hail Him! Jesus the Crucified.
Sound His praises! Jesus who bore our sorrows,
Love unbounded, wonderful, deep and strong.

Praise Him! Praise Him! Jesus, our blessed Redeemer!
Heavenly portals loud with hosannas ring!
Jesus, Savior, reigneth forever and ever.
Crown Him! Crown Him! Prophet, and Priest, and King!
Christ is coming! over the world victorious,
Power and glory unto the Lord belong.'),
(250, 'O for a thousand tongues to sing
my great Redeemer''s praise,
the glories of my God and King,
the triumphs of his grace!

My gracious Master and my God,
assist me to proclaim,
to spread through all the earth abroad
the honors of thy name.

Jesus! the name that charms our fears,
that bids our sorrows cease;
''tis music in the sinner''s ears,
''tis life, and health, and peace.

He breaks the power of canceled sin,
he sets the prisoner free;
his blood can make the foulest clean;
his blood availed for me.

He speaks, and listening to his voice,
new life the dead receive;
the mournful, broken hearts rejoice,
the humble poor believe.

Hear him, ye deaf; his praise, ye dumb,
your loosened tongues employ;
ye blind, behold your savior come,
and leap, ye lame, for joy.'),
(251, 'I serve a risen Savior,
He''s in the world today;
I know that He is living,
whatever men may say;
I see His hand of mercy,
I hear His voice of cheer
And just the time
I need Him He''s always near.

Refrain:
He lives, He lives,
Christ Jesus lives today!
He walks with me
and talks with me
along life''s narrow way.
He lives, He lives,
salvation to impart!
You ask me how I know He lives?
He lives within my heart.

In all the world around me
I see His loving care,
And tho'' my heart grows weary
I never will despair;
I know that He is leading
thru all the stormy blast,
The day of His appearing
will come at last.

Rejoice, rejoice, O Christian,
lift up your voice and sing,
Eternal hallelujahs
to Jesus Christ the King!
The hope of all who seek Him,
the help of all who find,
None other is so loving,
so good and kind.'),
(252, 'Come, let us sing the song of songs-
The angels first began the strain-
The homage which to Christ belongs:
"Worthy the Lamb, for He was slain!"

Slain to redeem us by His blood,
To cleanse from every sinful stain,
And make us kings and priests to God:
"Worthy the Lamb, for He was slain!"

To Him who suffered on the tree,
Our souls, at His soul''s price, to gain,
Blessing, and praise, and glory be:
"Worthy the Lamb, for He was slain!"

To Him, enthroned by filial right
All power in heaven and earth proclaim,
Honor, and majesty, and might:
"Worthy the Lamb, for He was slain!"

Long as we live, and when we die,
And while in heaven with Him we reign,
This song our song of songs shall be:
"Worthy the Lamb, for He was slain!"'),
(253, 'There''s no other name like Jesus,
''Tis the dearest name we know,
''Tis the angel''s joy in heaven,
''Tis the Christian''s joy below.

Refrain:
Sweet name, (sweet name) dear name, (dear name)
There''s no other name like Jesus;
Sweet name, (sweet name) dear name, (dear name)
There''s no other name like Jesus.

There''s no other name like Jesus
When the heart with grief is sad,
There''s no other name like Jesus
When the heart is free and glad.

''Tis the hope that I shall see Him
When in glory He appears,
''Tis the hope to hear His welcome
That my fainting spirit cheers.

If He wills that I should labor
In His vineyard day by day,
Then ''tis well if only Jesus
Blesses all I do or say.

If He wills that death''s cold finger
Touch my feeble, mortal clay,
Then ''tis well if only Jesus
Is my dying trust and stay.'),
(254, 'The great Physician now is near,
The sympathizing Jesus;
He speaks the drooping heart to cheer,
Oh! hear the voice of Jesus.

Refrain:
Sweetest note in seraph song,
Sweetest name on mortal tongue;
Sweetest carol ever sung,
Jesus, blessed Jesus.

Your many sins are all forgiven,
Oh! hear the voice of Jesus;
Go on your way in peace to heaven,
And wear a crown with Jesus.

All glory to the dying Lamb!
I now believe in Jesus;
I love the blessed Savior''s name,
I love the name of Jesus.

His name dispels my guilt and fear,
No other name but Jesus;
Oh! how my soul delights to hear
The charming name of Jesus.'),
(255, 'I cannot tell why He whom angels worship
Should set His love upon the souls of men,
Or why as Shepherd He should seek the wanderers,
To bring them back, they know not how nor when.
But this I know that He was born of Mary
When Bethlehem''s manger was His only home,
And that He lived at Nazareth and labored;
And so the Savior, Savior of the world, has come.

I cannot tell how silently He suffered
As with His peace He graced this place of tears,
Nor how His heart upon the cross was broken,
The crown of pain to three and thirty years.
But this I know He heals the broken hearted
And stays our sin and calms our lurking fear,
And lifts the burden from the heavy laden;
For still the Savior, Savior of the world, is here.

I cannot tell how He will win the nations,
How He will claim His earthly heritage,
How satisfy the needs and aspirations
Of east and west, of sinner and of sage.
But this I know all flesh shall see His glory,
And He shall reap the harvest He has sown,
And some glad day His sun will shine in splendor
When He the Savior, Savior of the world, is known.

I cannot tell how all the lands shall worship,
When at His bidding every storm is stilled,
Or who can say how great the jubilation
When all our hearts with love for Him are filled.
But this I know the skies shall sound His praises,
Ten thousand thousand human voices sing,
And earth to heaven, and heaven to earth will answer,
At last the Savior, Savior of the world, is King!'),
(256, 'Ye servants of God, your Master proclaim,
and publish abroad his wonderful name;
the name all-victorious of Jesus extol,
his kingdom is glorious and rules over all.

God ruleth on high, almighty to save,
and still he is nigh, his presence we have;
the great congregation his triumph shall sing,
ascribing salvation to Jesus, our King.

"Salvation to God, who sits on the throne!"
Let all cry aloud and honor the Son;
the praises of Jesus the angels proclaim,
fall down on their faces and worship the Lamb.

Then let us adore and give him his right,
all glory and power, all wisdom and might;
all honor and blessing with angels above,
and thanks never ceasing and infinite love.'),
(257, 'Come down, O Love divine, seek thou this soul of mine
and visit it with thine own ardor glowing;
O Comforter, draw near, within my heart appear,
and kindle it, thy holy flame bestowing.

O let it freely burn, till earthly passions turn
to dust and ashes in its heat consuming;
and let thy glorious light shine ever on my sight,
and clothe me round, the while my path illuming.

Let holy charity Mine outward vesture be,
And lowliness become my inner clothing;
True lowliness of heart which takes the humbler part,
And o''er its own shortcomings weeps with loathing.

And so the yearning strong with which the soul will long
shall far outpass the power of human telling;
for none can guess its grace, till Love create a place
wherein the Holy Spirit makes a dwelling.'),
(258, 'Baptize us anew With power from on high,
With love, O refresh us! Dear Savior, draw nigh.

Refrain:
We humbly beseech Thee, Lord Jesus, we pray,
With love and the Spirit baptize us today.
We praise Thee, we bless Thee, dear Lamb that was slain
We laud and adore Thee, Amen and Amen.

Unworthy we cry, Unholy, unclean,
O wash us and cleanse us From sin''s guilty stain.

O heavenly Dove, Descend from on high!
We plead Thy rich blessing; In mercy draw nigh.

O list the glad voice! From heaven it came:
Thou art My beloved, Well pleased I am.'),
(259, 'Draw us in the Spirit''s tether,
For when humbly in Thy name,
Two or three are met together,
Thou art in the midst of them;
Alleluia! Alleluia!
Touch we now Thy garment''s hem.

As the brethren used to gather
In the name of Christ to sup,
Then with thanks to God the Father
Break the bread and bless the cup,
Alleluia! Alleluia!
So knit Thou our friendship up

All our meals and all our living
Make us sacraments of Thee,
That by caring, helping, giving,
We may true disciples be.
Alleluia! Alleluia!
We will serve Thee faithfully.'),
(260, 'Hover o''er me, Holy Spirit,
Bathe my trembling heart and brow;
Fill me with Thy hallowed presence,
Come, O come and fill me now.

Refrain:
Fill me now, fill me now,
Jesus, come and fill me now.
Fill me with Thy hallowed presence,
Come, O come and fill me now.

Thou canst fill me, gracious Spirit,
Though I cannot tell Thee how;
But I need Thee, greatly need Thee;
Come, O come and fill me now.

I am weakness, full of weakness;
At Thy sacred feet I bow;
Blest, divine, eternal Spirit,
Fill with love, and fill me now.

Cleanse and comfort, bless and save me;
Bathe, O, bathe my heart and brow;
Thou art comforting and saving,
Thou art sweetly filling now.'),
(261, 'The Spirit of the Lord revealed
His will to saints of old;
Their heart and mind lips unsealed
His glory to unfold.
Amid the gloom of ancient night
They hailed the dawning Word,
And in the coming of the light
Proclaimed the coming Lord.

The prophets passed; at length there came
To sojourn and abide,
The Word incarnate, to whose name
The prophets testified;
And He, the twilight overpast,
Himself, the Light of light,
As man with man, revealed at last
The Father to our sight.

Eternal Spirit, who dost speak
To mind and conscience still,
That we in this our day, may seek
To do our Father''s will,
To us the word of life impart,
Of Christ, the living way;
Give us the quiet, humble heart
To hear and to obey.'),
(262, 'There''s a sweet, sweet spirit in this place,
And I know that it''s the spirit of the Lord;

Refrain:
Sweet Holy Spirit, Sweet Heavenly Dove,
Stay right here with us Filling us with Your love,
And for these blessings we lift our hearts in praise,
Without a doubt we''ll know that we have been revived
When we shall leave this place.

There are sweet expressions on each face
And I know they feel the presence of the Lord.'),
(263, 'Fire of God, Thou sacred flame,
Spirit who in splendor came,
Let Thy heat my soul refine
Till it glows with love divine.

Breath of God, that swept in power
In the pentecostal hour,
Holy Breath, be Thou in me
Source of vital energy.

Strength of God, Thy might within
Conquers sorrow, pain, and sin:
Fortify from evil''s art
All the gateways of my heart.

Truth of God, Thy piercing rays
Penetrate my secret ways.
May the light that shames my sin
Guide me holier paths to win.

Love of God, Thy grace profound
Knoweth neither age nor bound:
Come, my heart''s own guest to be,
Dwell forevermore in me.'),
(264, 'O for that flame of living fire
Which shone so bright in saints of old;
Which bade their souls to heaven aspire,
Calm in distress, in danger bold!

Where is that spirit, Lord, which dwelt
In Abram''s breast, and sealed Him Thine?
Which made Paul''s heart with sorrow melt,
And glow with energy divine?

That spirit which from age to age
Proclaimed Thy love, and taught Thy ways?
Brightened Isaiah''s vivid page,
And breathed in David''s hallowed lays?

Is not Thy grace as mighty now
As when Elijah felt its power?
When glory beamed from Moses'' brow,
Or Job endured the trying hour?

Remember, Lord, the ancient days;
Renew Thy work, Thy grace restore;
And while to Thee our hearts we raise,
On us Thy Holy Spirit pour.'),
(265, 'Breathe on me, breath of God,
Fill me with life anew,
That I may love what Thou dost love,
And do what Thou wouldst do.

Breathe on me, breath of God,
Until my heart is pure,
Until with Thee I will one will,
To do and to endure.

Breathe on me, breath of God,
Till I am wholly Thine,
Until this earthly part of me
Glows with Thy fire divine.

Breathe on me, breath of God,
So shall I constant be,
And live with Thee the perfect life
Of Thine eternity.'),
(266, 'Spirit of God, descend upon my heart;
wean it from earth; through all its pulses move;
stoop to my weakness, mighty as thou art,
and make me love thee as I ought to love.

I ask no dream, no prophet ecstasies,
no sudden rending of the veil of clay,
no angel visitant, no opening skies;
but take the dimness of my soul away.

Has thou not bid me love thee, God and King?
All, all thine own, soul, heart and strength and mind.
I see thy cross; there teach my heart to cling.
O let me seek thee, and O let me find.

Teach me to feel that thou art always nigh;
teach me the struggles of the soul to bear.
To check the rising doubt, the rebel sigh,
teach me the patience of unanswered prayer.

Teach me to love thee as thine angels love,
one holy passion filling all my frame;
the kindling of the heaven-descended Dove,
my heart an altar, and thy love the flame.'),
(267, 'Spirit divine, attend our prayers,
And make this house Thy home;
Descend with all Thy gracious powers,
O come, great Spirit, come!

Come as the light; to us reveal
Our emptiness and woe,
And lead us in those paths of life
Where-on the righteous go.

Come as the fire, and purge our hearts
Like sacrificial flame;
Let our whole soul an of - f''ring be
To our Redeemer''s name.

Come as the dove, and spread Thy wings,
The wings of peaceful love;
And let Thy church on earth become
Blest as the church above.

Spirit divine, attend our prayers,
Make a lost world Thy home;
Descend with all Thy gracious powers,
O come, great Spirit, come!'),
(268, 'Holy Spirit, light divine,
Shine upon this heart of mine,
Chase the shades of night away,
Turn my darkness into day.

Holy Spirit, power divine,
Cleanse this guilty heart of mine;
Long has sin, without control,
Held dominion o''er my soul.

Holy Ghost, with joy divine,
Cheer this saddened heart of mine,
Bid my many woes depart,
Heal my wounded, bleeding heart.

Holy Spirit, all divine,
Dwell within this heart of mine,
Cast down every idol throne,
Reign supreme, and reign alone.'),
(269, 'Come, Holy Spirit, heavenly Dove,
With all Thy quickening powers;
Kindle a flame of sacred love
In these cold hearts of ours.

O raise our thoughts from things below,
From vanities and toys!
Then shall we with fresh courage go
To reach eternal joys.

Awake our souls to joyful songs;
Let pure devotions rise;
Till praise employs our thankful tongues,
And doubt forever dies.

Father, we would no longer live
At this poor, dying rate;
To Thee our thankful love we give,
For Thine to us is great.

Come, Holy Spirit, heavenly Dove,
With all Thy quickening powers;
Come, shed abroad a Savior''s love,
And that shall kindle ours.'),
(270, 'O holy Dove of God descending,
You are the love that knows no ending.
All of our shattered dreams You''re mending:
Spirit, now live in me.

O holy Wind of God now blowing,
You are the seed that God us sowing.
You are the life that starts us growing:
Spirit, now live in me.

O holy Rain of God now falling,
You make the Word of God enthralling,
You are that inner voice now calling:
Spirit, now live in me.

O holy Flame of God now burning,
You are the power of Christ returning.
You are the answer to our yearning:
Spirit, now live in me.'),
(271, 'Break thou the bread of life, dear Lord, to me,
as thou didst break the loaves beside the sea;
beyond the sacred page I seek thee, Lord;
my spirit pants for thee, O Living Word!

Bless thou the truth, dear Lord, to me, to me,
as thou didst bless the bread by Galilee;
then shall all bondage cease, all fetters fall;
and I shall find my peace, my all in all.

Thou art the bread of life, O Lord, to me;
Thy holy Word the truth That saveth me;
Give me to eat and live With Thee above;
Teach me to love Thy truth, For Thou art love.

Spirit and life are they, Words Thou dost speak;
I hasten to obey, But I am weak;
Thou art my only help, Thou art my life;
Heeding Thy holy Word I win the strife.'),
(272, 'Give me the Bible,
star of gladness gleaming,
To cheer the wanderer
lone and tempest tossed,
No storm can hide that
peaceful radiance beaming
Since Jesus came
to seek and save the lost.

Refrain:
Give me the Bible--
holy message shining,
Thy light shall guide me
in the narrow way.
Precept and promise,
law and love combining,
''Til night shall vanish
in eternal day.

Give me the Bible
when my heart is broken,
When sin and grief have
filled my soul with fear,
Give me the precious
words by Jesus spoken,
Hold up faith''s lamp
to show my Savior near.

Give me the Bible,
all my steps enlighten,
Teach me the danger
of these realms below,
That lamp of safety,
o''er the gloom shall brighten,
That light alone
the path of peace can show.'),
(273, 'Lord, I have made Thy word my choice,
My lasting heritage;
There shall my noblest powers rejoice,
My warmest thoughts engage.

I''ll read the histories of Thy love,
And keep Thy laws in sight;
While through Thy promises I rove,
With ever fresh delight.

In this broad land of wealth unknown,
Where springs of life arise,
Seeds of immortal bliss are sown,
And hidden glory lies.

The best relief that mourners have,
It makes our sorrows blest;
Our fairest hope beyond the grave,
And our eternal rest.'),
(274, 'O Word of God incarnate,
O Wisdom from on high,
O Truth unchanged, unchanging,
O Light of our dark sky:
we praise you for the radiance
that from the hallowed page,
a lantern to our footsteps,
shines on from age to age.

The church from her dear Master
received the gift divine,
and still that light is lifted
o''er all the earth to shine.
It is the sacred vessel
where gems of truth are stored;
it is the heaven-drawn picture
of Christ, the living Word.

It floateth like a banner
before God''s host unfurled;
it is a shining beacon
above the darkling world.
It is the chart and compass
that o''er life''s surging tide,
mid mists and rocks and quicksands,
Still guides, O Christ, to Thee.

O make Thy church, dear Savior,
a lamp of purest gold,
to bear before the nations
your true light as of old.
O teach your wandering pilgrims
by this their path to trace,
till, clouds and darkness ended,
they see Thee face to face.'),
(275, 'O God of light, Your Word, a lamp unfailing,
Shall pierce the darkness of our earthbound way
And show your grace, Your plan for us unveiling,
And guide our footsteps to the perfect day.

From days of old,through blind and willful ages,
Though we rebelled, You gently sought again,
And spoke through saints, apostles, prophets, sages,
Who wrote with eager or reluctant pen.

Undimmed by time,those words are still revealing
To sinful hearts Your justice and Your grace;
And questing mortals longing for Your healing,
See Your compassion in the Savior''s face.

To all the world Your summons You are sending,
Through all the earth, to every land and race,
That myriad tongues, in one great anthem blending,
May praise and celebrate Your gift of grace.'),
(276, 'Thanks to God whose Word was spoken
In the deed that made the earth.
His the voice that called a nation;
His the fires that tried her worth.
God has spoken;
Praise Him for His open Word.

Thanks to God whose Word incarnate
Glorified the flesh of man.
Deeds and words and death and rising
Tell the grace in heaven''s plan.
God has spoken;
Praise Him for His open Word.

Thanks to God whose Word is answered
By the Spirit''s voice wihin.
Here we drink of joy unmeasured,
Life redeemed from death and sin.
God is speaking;
Praise Him for His open Word.'),
(277, 'For Your holy book we thank You,
And for all who served You well,
Writing, guarding, and translating,
That its pages might forth tell
Your strong love and tender care
For Your people everywhere.

For Your holy book we thank You,
And for those who work today,
That the people of all nations,
Reading it and following may
Know Your love and tender care
For Your people everywhere.

For Your holy book we thank You,
May its message be our guide,
May we understand the wisdom
Of the laws it will provide:
And Your love and tender care
For Your people everywhere.

For Your holy book we thank You,
May its message in our hearts
Lead us now to see in Jesus
All the grace Your word imparts:
All Your love and tender care
For Your people everywhere.'),
(278, 'Lord Jesus, once You spoke to men
Upon the mountain and the plain,
O help us listen now as then
And wonder at Your words again.

We all have secret fears to face,
Our minds and motives to amend.
We seek Your truth, we need Your grace,
Our living Lord and present friend.

The gospel speaks; and we receive
Your light, Your love, Your own command.
O help us live what we believe,
In daily word of heart and hand.'),
(279, 'Come, every soul by sin oppressed,
There''s mercy with the Lord,
And He will surely give you rest,
By trusting in His word.

Refrain:
Only trust Him, only trust Him,
Only trust Him now;
He will save you, He will save you,
He will save you now.

For Jesus shed his precious blood
Rich blessings to bestow;
Plunge now into the crimson flood
That washes white as snow.

Yes, Jesus is the truth, the way,
That leads you into rest;
Believe in Him without delay,
And you are fully blest.

Come, then, and join this holy band,
And on to glory go,
To dwell in that celestial land,
Where joys immortal flow.'),
(280, 'Come, ye sinners poor and needy,
Weak and wounded, sick and sore;
Jesus ready stands to save you,
Full of pity, love, and power.

Refrain:
I will arise and go to Jesus,
He will embrace me in His arms;
In the arms of my dear Savior,
O there are ten thousand charms.

Come. ye thirsty, come, and welcome,
God''s free bounty glorify;
True belief and true repentance,
Every grace that brings you nigh.

Let not conscience make you linger,
Nor of fitness fondly dream;
All the fitness He requireth
Is to feel your need of Him.

Lo! th''incarnate God, ascended,
Pleads the merit of His blood;
Venture on Him, venture wholly,
Let no other trust intrude.')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(281, 'I gave my life for thee,
My precious blood I shed,
That thou might''st ransom be,
And quickened from the dead;
I gave, I gave My life for thee,
What hast thou given for Me?
I gave, I gave My life for thee,
What hast thou given for Me?

My Fathers house of light,
My glory circled throne,
I left for earthly night,
For wanderings sad and lone;
I left, I left it all for thee,
Hast thou left aught for Me?
I left, I left it all for thee,
Hast thou left aught for Me?

I suffered much for thee,
more than thy tongue can tell,
Of bitterest agony,
To rescue thee from hell;
I''ve borne, I''ve borne it all for thee,
What hast thou borne for Me?
I''ve borne, I''ve borne it all for thee,
What hast thou borne for Me?'),
(282, 'I hear Thy welcome voice,
That calls me, Lord, to Thee;
For cleansing in Thy precious blood,
That flowed on Calvary.

Refrain:
I am coming, Lord!
Coming now to Thee!
Wash me, cleanse me, in the blood
That flowed on Calvary.

Though coming weak and vile,
Thou dost my strength assure;
Thou dost my vileness fully cleanse,
Till spotless all, and pure.

''Tis Jesus calls me on
To perfect faith and love,
To perfect hope, and peace, and trust,
For earth and heaven above.

All hail, atoning blood!
All hail, redeeming grace!
All hail! the gift of Christ, our Lord,
Our Strength and Righteousness.'),
(283, 'O Jesus, thou art standing,
outside the fast closed door,
in lowly patience waiting
to pass the threshold o''er:
O shame, professing Christians,
his Name and sign who bear,
O shame, thrice shame upon us,
to keep him standing there!

O Jesus, thou art knocking;
and lo, that hand is scarred,
and thorns thy brow encircle,
and tears thy face have marred:
O love that passeth knowledge,
so patiently to wait!
O sin that hath no equal,
so fast to bar the gate!

O Jesus, thou art pleading
in accents meek and low,
"I died for you, my children,
and will you treat me so?"
O Lord, with shame and sorrow
we open now the door;
dear Savior, enter, enter,
and leave us never more.'),
(284, 'I have a Savior, He''s pleading in glory,
A dear, loving Savior, though earth friends be few;
And now He is watching in tenderness o''er me,
But oh that my Savior were your Savior, too.

Refrain:
For you I am praying, For you I am Praying,
For you am I praying, I''m praying for you.

I have a Father; to me He has given
A hope for eternity, blessed and true;
And soon He will call to meet Him in heaven,
But oh that He''d let me bring you with me, too!

I have a robe; ''tis resplendent in whiteness,
Awaiting in glory my wondering view;
Oh, when I receive it, all shining in brightness,
Dear friend, could I see you receiving one, too!

When Jesus has found you, tell others the story,
That my loving Savior is your Savior, too;
Then pray that your Savior will bring them to glory,
And prayer will be answered-''twas answered for you!'),
(285, 'Jesus calls us o''er the tumult
of our life''s wild, restless sea;
day by day his sweet voice soundeth,
saying, "Christian, follow me!"

Jesus calls us from the worship
of the vain world''s golden store,
from each idol that would keep us,
saying, "Christian, love me more!"

In our joys and in our sorrows,
days of toil and hours of ease,
still he calls, in cares and pleasures,
"Christian, love me more than these!"

Jesus calls us! By thy mercies,
Savior, may we hear thy call,
give our hearts to thine obedience,
serve and love thee best of all.'),
(286, 'Sing them over again to me,
wonderful words of life,
Let me more of their beauty see,
wonderful words of life;
Words of life and beauty
teach me faith and duty.

Refrain:
Beautiful words, wonderful words,
wonderful words of life,
Beautiful words, wonderful words,
wonderful words of life.

Christ, the bless''d One, gives to all
wonderful words of life;
Sinner, list to the loving call,
wonderful words of life;
All so freely given,
wooing us to heaven.

Sweetly echo the Gospel call,
wonderful words of life;
Offer pardon and peace to all,
wonderful words of life;
Jesus, only Savior,
sanctify forever.'),
(287, 'Softly and tenderly Jesus is calling,
calling for you and for me;
see, on the portals he''s waiting and watching,
watching for you and for me.

Refrain:
Come home, come home;
ye who are weary come home;
earnestly, tenderly, Jesus is calling,
calling, O sinner, come home!

Why should we tary when Jesus is pleading,
pleading for you and for me?
Why should we linger and heed not his mercies,
mercies for you and for me?

Think of the wonderful love he has promised,
promised for you and for me!
Though we have sinned, he has mercy and pardon,
pardon for you and for me.'),
(288, 'I am going to Calvary.
Would you like to come with Me
All the way and back again?
You must follow the Leader then.
You must follow the Leader,
You must follow the Leader,
All the way and back again,
You must follow the Leader.

If I wear a thorny crown,
If the soldiers knock Me down
Can I really be a king?
Love will answer everything
If you follow the Leader,
If you follow the Leader,
Love will answer everything
If you follow the Leader.

When I go along the road,
I shall lift a heavy load.
I will carry a cross for you.
You will learn to carry it too
When you follow the Leader,
When you follow the Leader,
You will learn to carry it too
If you follow the Leader.

I am going to stretch My hands,
Reaching out to all the lands.
Can I really be a king?
Love''s the Lord of everything,
When you follow the Leader,
When you follow the Leader,
Love''s the Lord of everything
When you follow the Leader.'),
(289, 'The Savior is waiting to enter your heart
Why don''t you let Him come in?
There''s nothing in this world to keep you apart
What is your answer to Him?

Refrain:
Time after time
He has waited before
And now He is waiting again
To see if you are willing
To open the door
Oh, how He wants to come in.

If you''ll take one step
Toward the Savior, my friend,
You''ll find His arms open wide.
Receive Him, and all of your darkness will end
Within your heart He''ll abide.'),
(290, 'O soul, are you weary and troubled?
No light in the darkness you see?
There''s light for a look at the Savior,
And life more abundant and free!

Refrain:
Turn your eyes upon Jesus,
Look full in His wonderful face,
And the things of earth will grow strangely dim,
In the light of His glory and grace.

Through death into life everlasting
He passed, and we follow Him there;
Over us sin no more hath dominion--
For more than conquerors we are!

His Word shall not fail you--He promised;
Believe Him, and all will be well:
Then go to a world that is dying,
His perfect salvation to tell!'),
(291, 'We have not known Thee as we ought,
Nor learned Thy wisdom, grace, and power;
The things of earth have filed our thoughts,
And trifles of the passing hour.
Lord, give us light Thy truth to see,
And make us wise in knowing Thee.

We have not feared Thee as we ought,
Nor bowed beneath Thine awful eye,
Nor guarded deed, and word, and thought,
Remembering that God was nigh.
Lord, give us faith to know Thee near,
And grant the grace of holy fear.

We have not loved Thee as we ought,
Nor cared that we are loved by Thee;
Thy presence we have coldly sought,
And feebly longed Thy face to see.
Lord, give a pure and loving heart
To feel and own the love Thou art.

We have not served Thee as we ought;
Alas! the duties left undone,
The work with little fervor wrought,
The battles lost, or scarcely won!
Lord, give the zeal, and give the might,
For Thee to toil, for Thee to fight.

When shall we know Thee as we ought,
And fear, and love, and serve aright!
When shall we, out of trial brought,
Be perfect in the land of light!
Lord, may we day by day prepare
To see Thy face, and serve Thee there.'),
(292, 'Out of my bondage, sorrow and night,
Jesus, I come, Jesus, I come;
Into Thy freedom, gladness and light,
Jesus, I come to Thee;
Out of my sickness into Thy health,
Out of my want and into Thy wealth,
Out of my sin and into Thyself,
Jesus, I come to Thee.

Out of my shameful failure and loss,
Jesus, I come, Jesus, I come;
Into the glorious gain of Thy cross,
Jesus, I come to Thee;
Out of earth''s sorrows into Thy balm,
Out of life''s storms and into Thy calm,
Out of distress to jubilant psalm,
Jesus, I come to Thee.

Out of unrest and arrogant pride,
Jesus, I come, Jesus, I come;
Into Thy blessed will to abide,
Jesus, I come to Thee;
Out of myself to dwell in Thy love,
Out of despair into raptures above,
Upward for aye on wings like a dove,
Jesus, I come to Thee.

Out of the fear and dread of the tomb,
Jesus, I come, Jesus, I come;
Into the joy and light of Thy home,
Jesus, I come to Thee;
Out of the depths of ruin untold,
Into the peace of Thy sheltering fold,
Ever Thy glorious face to behold,
Jesus, I come to Thee.'),
(293, 'Heavenly Father, bless us now;
At the cross of Christ we bow;
Take our guilt and grief away;
Hear and heal us now, we pray.

Now, O Lord, this very hour,
Send Thy grace and show Thy power;
While we rest upon Thy word,
Come, and bless us now, O Lord!

Mercy now, O Lord, we plead
In this hour of utter need;
Turn us not away unblest;
Calm our anguish into rest.

O Thou loving, blessed One,
Rising o''er us like the sun,
Light and life art Thou within:
Savior, Thou, from every sin!'),
(294, 'Would you be free from the burden of sin?
There''s pow''r in the blood, pow''r in the blood;
Would you o''er evil a victory win?
There''s wonderful power in the blood.

Refrain:
There is pow''r, pow''r, wonder working pow''r
In the blood of the Lamb;
There is pow''r, pow''r, wonder working pow''r
In the precious blood of the Lamb.

Would be free from your passion and pride?
There''s pow''r in the blood, pow''r in the blood;
Come for a cleansing to Calvary''s tide?
There''s wonderful power in the blood.

Would you do service for Jesus your King?
There''s pow''r in the blood, pow''r in the blood;
Would you live daily His praises to sing?
There''s wonderful power in the blood.'),
(295, 'Chief of sinners though I be,
Jesus shed His blood for me;
Died that I might live on high,
Died that I might never die;
As the brance is to the vine,
I am His, and He is mine.

O the height of Jesus'' love!
Higher than the heaven above,
Deeper than the deepest sea,
Lasting as eternity;
Love that found me-wondrous thought!
Found me when I sought Him not!

Chief of sinners though I be,
Christ is all in all to me;
All my wants to Him are known,
All my sorrows are His own;
Safe with Him from earthly strife,
He sustains the hidden life.'),
(296, 'I''ve wandered far away from God,
Now I''m coming home;
The paths of sin too long I''ve trod;
Lord, I''m coming home.

Refrain:
Coming home, coming home
Never more to roam;
Open wide Thine arms of love;
Lord I''m coming home.

I''ve wasted many precious years,
Now I''m coming home;
I now repent with bitter tears;
Lord, I''m coming home.

I''m tired of sin and straying Lord,
Now I''m coming home;
I''ll trust thy love belive thy word;
Lord I''m coming home.

My only hope, my only plea,
Now I''m coming home;
That Jesus died, and died for me;
Lord I''m coming home.

I need His cleansing blood I know,
Now I''m coming home;
O wash me whiter than the snow;
Lord I''m coming home.'),
(297, 'God, be merciful to me,
On Thy grace I rest my plea;
Plenteous in compassion Thou,
Blot out my transgressions now;
Wash me, make me pure within,
Cleanse, O cleanse me from my sin,
Wash me, make me pure within,
Cleanse, O cleanse me from my sin.

I am evil, born in sin;
Thou desirest truth within.
Thou alone my Savior art,
Teach Thy wisdom to my heart;
Make me pure, Thy grace bestow,
Wash me whiter than the snow,
Make me pure, Thy grace bestow,
Wash me whiter than the snow.

Gracious God, my heart renew,
Make my spirit right and true;
Cast me not away from Thee,
Let Thy Spirit dwell in me;
Thy salvation''s joy impart,
Steadfast make my willing heart,
Thy salvation''s joy impart,
Steadfast make my willing heart.

Sinners then shall learn from me
And return, O God, to Thee;
Savior, all my guilt remove,
And my tongue shall sing Thy love;
Touch my silent lips, O Lord,
And my mouth shall praise accord,
Touch my silent lips, O Lord,
And my mouth shall praise accord.'),
(298, 'I lay my sins on Jesus,
The spotless Lamb of God;
He bears them all, and frees us
From the accursed load,
From the accursed load.

I bring my guilt to Jesus,
To wash my crimson stains
White in His blood most precious,
Till not a stain remains,
Till not a stain remains.

I lay my wants on Jesus,
All fullness dwells in Him;
He healeth my diseases,
He doth my soul redeem,
He doth my soul redeem.

I long to be like Jesus,
Meek loving, lowly, mild;
I long to be like Jesus,
The Father''s holy child,
The Father''s holy child.

I long to be with Jesus
Amid the heav''nly throng,
To sing with them His praises,
And learn the angels''song,
And learn the angels''song.'),
(299, '"Forgive our sins as we forgive,"
You taught us, Lord, to pray;
But You alone can grant us grace
To live the words we say.

How can Your pardon reach and bless
The unforgiving heart
That broods on wrongs and will not let
Old bitterness depart?

In blazing light Your cross reveals
The truth we dimly knew:
How trifling others'' debts to us;
How great our debt to You!

Lord, cleanse the depths within our souls
And bid resentment cease;
Then, by Your mercy reconciled,
Our lives will spread Your peace.'),
(300, 'Rock of Ages, cleft for me,
Let me hide myself in Thee;
Let the water and the blood,
From Thy riven side which flowed,
Be of sin the double cure,
Cleanse me from its guilt and power.

Not the labor of my hands
Can fulfill Thy law''s demands;
Could my zeal no respite know,
Could my tears forever flow,
All for sin could not atone;
Thou must save, and Thou alone.

When my pilgrimage I close;
Victor o''er the last of foes,
When I soar to worlds unknown,
And behold Thee on Thy throne,
Rock of Ages, cleft for me,
Let me hide myself in Thee.'),
(301, 'Nearer, still nearer, close to Thy heart,
Draw me, my Savior, so precious Thou art;
Fold me, O fold me close to Thy breast,
Shelter me safe in that haven of rest,
Shelter me safe in that haven of rest.

Nearer, still nearer, nothing I bring,
Nought as an offering to Jesus my King-
Only my sinful now contrite heart,
Grant me the cleansing Thy blood doth impart,
Grant me the cleansing Thy blood doth impart.

Nearer, still nearer, Lord, to be Thine;
Sin, with its follies, I gladly resign,
All of its pleasures, pomp and its pride;
Give me but Jesus, my Lord crucified,
Give me but Jesus, my Lord crucified.

Nearer, still nearer, while life shall last;
Till safe in glory my anchor is cast;
Through endless ages, ever to be,
Nearer, my Savior, still nearer to Thee,
Nearer, my Savior, still nearer to Thee.'),
(302, 'In the blood from the cross,
I have been washed from sin;
But to be free from dross,
Still I would enter in.

Refrain:
Deeper yet, deeper yet,
Into the crimson flood;
Deeper yet, deeper yet,
Under the precious blood.

Day by day, hour by hour,
Blessings are sent to me;
But for more of His power,
Ever my prayer shall be.

Near to Christ I would live,
Following Him each day;
What I ask He will give;
So then with faith I pray.

Now I have peace, sweet peace,
While in this world of sin;
But to pray I''ll not cease
Till I am pure within.'),
(303, 'Beneath the cross of Jesus
I fain would take my stand,
the shadow of a mighty rock
within a weary land;
a home within the wilderness,
a rest upon the way,
from the burning of the noontide heat,
and the burden of the day.

Upon that cross of Jesus
mine eye at times can see
the very dying form of One
who suffered there for me;
and from my stricken heart with tears
two wonders I confess:
the wonders of redeeming love
and my unworthiness.

I take, O cross, thy shadow
for my abiding place;
I ask no other sunshine than
the sunshine of his face;
content to let the world go by,
to know no gain nor loss,
my sinful self my only shame,
my glory all the cross.'),
(304, 'Faith of our fathers, living still,
In spite of dungeon, fire and sword;
O how our hearts beat high with joy
Whenever we hear that glorious Word!
Faith of our fathers, holy faith!
We will be true to thee till death.

Our fathers, chained in prisons dark,
Were still in heart and conscience free:
How sweet would be their children''s fate.
If they, like them, could die for thee!
Faith of our fathers, holy faith!
We will be true to thee till death.

Faith of our fathers, we will love
Both friend and foe in all our strife;
And preach Thee, too, as love knows how
By kindly words and virtuous life.
Faith of our fathers, holy faith!
We will be true to thee till death.'),
(305, 'In the morning, when I rise
In the morning, when I rise
In the morning, when I rise

Refrain:
Give me Jesus.
Give me Jesus,
Give me Jesus.
You can have all this world,
Just give me Jesus.

Dark mid-night was my cry,
Dark mid-night was my cry,
Dark midnight was my cry,
Give me Jesus.

Just about the break of day,
Just about the break of day,
Just about the break of day,
Give me Jesus.

Oh, when I come to die,
Oh, when I come to die,
Oh, when I come to die,
Give me Jesus.'),
(306, 'I am thine, O Lord, I have heard thy voice,
and it told thy love to me;
but I long to rise in the arms of faith
and be closer drawn to thee.

Refrain:
Draw me nearer, nearer, blessed Lord,
to the cross where thou hast died.
Draw me nearer, nearer, nearer, blessed Lord,
to thy precious, bleeding side.

Consecrate me now to thy service, Lord,
by the power of grace divine;
let my soul look up with a steadfast hope,
and my will be lost in thine.

O the pure delight of a single hour
that before thy throne I spend,
when I kneel in prayer, and with thee, my God,
I commune as friend with friend!'),
(307, 'I am coming to the cross;
I am poor and weak and blind;
I am counting all but dross;
I shall full salvation find.

Refrain:
I am trusting, Lord, in Thee.
O thou Lamb of Calvary;
Humbly at Thy cross I bow.
Save me, Jesus, save me now.

Long my heart has sighed for Thee;
Long has evil reigned within;
Jesus sweetly speaks to me:
''I will cleanse you from all sin.''

Here I give my all to Thee:
Friends and time and earthly store;
Soul and body Thine to be,
Wholly Thine forevermore.

Jesus comes! He fills my soul!
Perfected in Him I am;
I am every whit made whole:
Glory, glory to the Lamb!'),
(308, 'I would be, dear Savior, wholly Thine;
Teach me how, teach me how;
I would do Thy will, O Lord, not mine;
Help me, help me now.

Refrain:
Wholly Thine, wholly Thine,
Wholly Thine, this is my vow;
Wholly Thine, wholly Thine,
Wholly Thine, O Lord, just now.

What is worldly pleasure, wealth or fame,
Without Thee, without Thee?
I will leave them all for Thy dear Name,
This my wealth shall be.

As I cast earth''s transient joys behind,
Come Thou near, come Thou near;
In Thy presence all in all I find,
''Tis my comfort here.'),
(309, 'All to Jesus I surrender;
all to him I freely give;
I will ever love and trust him,
in his presence daily live.

Refrain:
I surrender all, I surrender all,
all to thee, my blessed Savior,
I surrender all.

All to Jesus I surrender;
humbly at his feet I bow,
worldly pleasures all forsaken;
take me, Jesus, take me now.

All to Jesus I surrender;
make me, Savior, wholly thine;
fill me with thy love and power;
truly know that thou art mine.

All to Jesus I surrender;
now I feel the sacred flame.
O the joy of full salvation!
Glory, glory, to his name!'),
(310, 'I would draw nearer to Jesus, In His sweet presence abide,
Constantly trying to serve Him, Safe and secure at His side.
I would draw nearer to Jesus, I would draw nearer to Him;
Fully surrendered each moment, I would draw nearer to Him.

I would draw nearer to Jesus, Nothing withholding from Him,
Knowing He loves to be gracious, I would draw nearer to Him.
I would draw nearer to Jesus, I would draw nearer to Him;
Fully surrendered each moment, I would draw nearer to Him.

I would draw nearer to Jesus, Seeking Hi strength to be true,
Willing to tell of His goodness, Gladly His blest will to do.
I would draw nearer to Jesus, I would draw nearer to Him;
Fully surrendered each moment, I would draw nearer to Him.'),
(311, 'Earthly pleasures vainly call me;
I would be like Jesus;
Nothing worldly shall enthrall me;
I would be like Jesus.

Refrain:
Be like Jesus, this my song,
In the home and in the throng;
Be like Jesus, all day long!
I would be like Jesus.

He has broken every fetter,
I would be like Jesus;
That my soul may serve Him better,
I would be like Jesus.

All the way from earth to glory,
I would be like Jesus;
Telling o''er and o''er the story,
I would be like Jesus.

That in Heaven He may meet me,
I would be like Jesus;
That His words ''Well done'' may greet me,
I would be like Jesus.'),
(312, 'Jesus, keep me near the cross;
there a precious fountain,
free to all, a healing stream,
flows from Calvary''s mountain.

Refrain:
In the cross, in the cross,
be my glory ever,
till my raptured soul shall find
rest beyond the river.

Near the cross, a trembling soul,
love and mercy found me;
there the bright and morning star
sheds its beams around me.

Near the cross! O Lamb of God,
bring its scenes before me;
help me walk from day to day
with its shadow o''er me.

Near the cross I''ll watch and wait,
hoping, trusting ever,
till I reach the golden strand
just beyond the river.'),
(313, 'Just as I am, without one plea,
But that Thy blood was shed for me,
And that Thou bidst me come to Thee,
O Lamb of God, I come, I come.

Just as I am, and waiting not
To rid my soul of one dark blot,
To Thee whose blood can cleanse each spot,
O Lamb of God, I come, I come.

Just as I am, though tossed about
With many a conflict, many a doubt,
"Fightings within, and fears without,"
O Lamb of God, I come, I come.

Just as I am, poor, wretched, blind;
Sight, riches, healing of the mind,
Yea, all I need in Thee to find,
O Lamb of God, I come, I come.

Just as I am, Thou wilt receive,
Wilt welcome, pardon, cleanse, relieve;
Because Thy promise I believe,
O Lamb of God, I come, I come.

Just as I am, Thy love I own
Has broken every barrier down;
Now, to be Thine, and Thine alone,
O Lamb of God, I come, I come.'),
(314, 'Just as I am, without one plea,
but that thy blood was shed for me,
and that thou bidst me come to thee,
O Lamb of God, I come, I come.

Just as I am, and waiting not
to rid my soul of one dark blot,
to thee whose blood can cleanse each spot,
O Lamb of God, I come, I come.

Just as I am, though tossed about
with many a conflict, many a doubt,
fightings and fears within, without,
O Lamb of God, I come, I come.

Just as I am, poor, wretched, blind;
sight, riches, healing of the mind,
yea, all I need in thee to find,
O Lamb of God, I come, I come.

Just as I am, thou wilt receive,
wilt welcome, pardon, cleanse, relieve;
because thy promise I believe,
O Lamb of God, I come, I come.

Just as I am, thy love I own
hath broken every barrier down;
now, to be thine, and thine alone,
O Lamb of God, I come, I come.'),
(315, 'O for a closer walk with God,
A calm and heavenly frame,
A light to shine upon the road
That leads me to the Lamb!

Return, O holy Dove, return,
Sweet messenger of rest!
I hate the sins that made Thee mourn
And drove Thee from my breast.

What peaceful hours I once enjoyed!
How sweet their memory still!
But they have left an aching void
The world can never fill.

The dearest idol I have known,
Whate''er that idol be
Help me to tear it from Thy throne,
And worship only Thee.'),
(316, 'Live out Thy life within me, O Jesus, King of kings!
Be Thou Thyself the answer To all my questionings;
Live out Thy life within me, In all things have Thy way!
I, the transparent medium Thy glory to display.

The temple has been yielded, And purified of sin;
Let Thy Shekinah glory Now shine forth from within,
And all the earth keep silence, The body henceforth be
Thy silent, gentle servant, Moved only as by Thee.

Its members every moment Held subject to Thy call,
Ready to have Thee use them, Or not be used at all;
Held without restless longing, Or strain, or stress, or fret
Or chafings at Thy dealings, Or thoughts of vain regret.

But restful, calm, and pliant, From bend and bias free,
Awaiting Thy decision, When Thou hast need of me.
Live out Thy life within me, O Jesus, King of kings!
Be Thou the glorious answer To all my questionings.'),
(317, 'King of my life, I crown Thee now,
Thine shall the glory be;
Lest I forget Thy thorn crowned brow,
Lead me to Calvary.

Refrain:
Lest I forget Gethsemane,
Lest I forget Thine agony;
Lest I forget Thy love for me,
Lead me to Calvary.

Show me the tomb where Thou wast laid,
Tenderly mourned and wept;
Angels in robes of light arrayed
Guarded Thee whilst Thou slept.

Let me like Mary, through the gloom,
Come with a gift to Thee;
Show to me now the empty tomb,
Lead me to Calvary.

May I be willing, Lord, to bear
Daily my cross for Thee;
Even Thy cup of grief to share,
Thou hast borne all for me.'),
(318, 'Lord Jesus, I long to be perfectly whole;
I want Thee forever to live in my soul;
Break down every idol, cast out every foe;
Now wash me, and I shall be whiter than snow.

Refrain:
Whiter than snow, yes, whiter than snow;
Now wash me, and I shall be whiter than snow.

Lord Jesus, look down from Thy throne in the skies,
And help me to make a complete sacrifice;
I give up myself, and whatever I know;
Now wash me, and I shall be whiter than snow.

Lord Jesus, for this I most humbly entreat;
I wait, blessed Lord, at Thy crucified feet,
By faith, for my cleansing; I see Thy blood flow;
Now wash me, and I shall be whiter than snow.

Lord Jesus, Thou seest I patiently wait;
Come now, and within me a new heart create;
To those who have sought Thee,
Thou never said''st No;
Now wash me, and I shall be whiter than snow.'),
(319, 'Lord, I want to be a Christian in my heart, in my heart,
Lord, I want to be a Christian in my heart, in my heart.
In my heart, in my heart,
Lord, I want to be a Christian in my heart, in my heart.

Lord, I want to be more loving in my heart, in my heart,
Lord, I want to be more loving in my heart, in my heart.
In my heart, in my heart,
Lord, I want to be more loving in my heart, in my heart.

Lord, I want to be more holy in my heart, in my heart,
Lord, I want to be more holy in my heart, in my heart.
In my heart, in my heart,
Lord, I want to be more holy in my heart, in my heart.

Lord, I want to be more like Jesus in my heart, in my heart,
Lord, I want to be more like Jesus in my heart, in my heart.
In my heart, in my heart,
Lord, I want to be more like Jesus in my heart, in my heart.'),
(320, 'Lord of creation, to you be all praise!
Most mighty your working, most wondrous your ways!
Your glory and might are beyond us to tell,
And yet in the heart of the humble you dwell.

Lord of all power, I give you my will,
In joyful obedience your tasks to fulfill.
Your bondage is freedom; your service is song;
And held in your keeping, my weakness is strong.

Lord of all wisdom, I give you my mind,
Rich truth that surpasses man''s knowledge to find;
What eye has not seen and what ear has not heard
Is taught by your spirit and shines from your word.

Lord of all being, I give you my all,
If I ever disown you, I stumble and fall;
But led in your service your word to obey,
I''ll walk in your freedom to the end of the way.'),
(321, 'My Jesus, I love thee, I know thou art mine;
for thee all the follies of sin I resign.
My gracious Redeemer, my Savior art thou;
if ever I loved thee, my Jesus, ''tis now.

I love thee because thou hast first loved me,
and purchased my pardon on Calvary''s tree;
I love thee for wearing the thorns on thy brow;
if ever I loved thee, my Jesus, ''tis now.

I''ll love Thee in life, I will love Thee ''til death,
And praise Thee as long as Thou lendest me breath;
And say when the death dew lies cold on my brow,
if ever I loved thee, my Jesus, ''tis now.

In mansions of glory and endless delight;
I''ll ever adore thee in heaven so bright;
I''ll sing with the glittering crown on my brow;
if ever I loved thee, my Jesus, ''tis now.'),
(322, 'Nothing between my soul and my Savior,
naught of this world''s delusive dream;
I have renounced all sinful pleasure;
Jesus is mine, there''s nothing between.

Refrain:
Nothing between my soul and my Savior,
so that his blessed face may be seen;
nothing preventing the least of his favor;
keep the way clear! let nothing between.

Nothing between, like worldly pleasure;
habits of life, though harmless they seem,
must not my heart from him ever sever;
he is my all, there''s nothing between.

Nothing between, e''en many hard trials,
though the whole world against me convene;
watching with prayer and much self denial,
I''ll triumph at last, there''s nothing between.'),
(323, 'O for a heart to praise my God,
A heart from sin set free,
A heart that always feels Thy blood
So freely shed for me.

A heart resigned, submissive, meek,
My dear Redeemer''s throne,
Where only Christ is heard to speak,
Where Jesus reigns alone.

A heart in every thought renewed
And full of love divine,
Perfect and right and pure and good,
A copy, Lord, of Thine.

Thy nature, gracious Lord, impart;
Come quickly from above;
Write Thy new name upon my heart,
Thy new, best name of Love.'),
(324, 'Just as I am, Thine own to be,
Friend of the young, who lovest me,
To consecrate myself to Thee,
O Jesus Christ, I come.

In the glad morning of my day,
My life to give, my vows to pay,
With no reserve and no delay,
With all my heart I come.

I would live ever in the light,
I would work ever for the right;
I would serve Thee with all my might;
Therefore, to Thee I come.

Just as I am, young, strong, and free,
To be the best that I can be
For truth, and righteousness, and Thee,
Lord of my life, I come.'),
(325, 'Jesus, I my cross have taken, all to leave and follow Thee.
All things else I have forsaken, Thou from hence my all shall be.
Perish every fond ambition, all I''ve sought or hoped or known.
Yet how rich is my condition! God and Heaven are still mine own.

Let the world despise and leave me, they have left my Savior, too.
Human hearts and looks deceive me; Thou art faithful, Thou art true.
O, ''tis not in grief to harm me, while thy love is left to me;
O, ''twere not in joy to charm me, If that love be hid from me.

Soul, then know thy full salvation; rise o''er sin, and fear, and care;
Joy to find in every station something still to do or bear:
Think what Spirit dwells within thee; Think what Father''s smiles are thine;
Think that Jesus died to win thee, child of heaven, canst thou repine?

Haste then on from grace to glory, armed by faith, and winged by prayer,
Heaven''s eternal day''s before thee, God''s own hand shall guide thee there.
Soon shall close thy earthly mission, soon shall pass thy pilgrim days;
Hope soon change to glad fruition, faith to sight, and prayer to praise.'),
(326, 'Open my eyes, that I may see
Glimpses of truth Thou hast for me;
Place in my hands the wonderful key
That shall unclasp and set me free.
Silently now I wait for Thee,
Ready, my God, Thy will to see;
Open my eyes,
illumine me, Spirit Divine!

Open my ears that I may hear
Voices of truth Thou sendest clear;
and while the wavenotes fall on my ear,
Everything false will disappear.
Silently now I wait for Thee,
Ready, my God, Thy will to see;
Open my ears, illumine me, Spirit Divine!

Open my mouth, and let me bear
Gladly the warm truth everywhere;
Open my heart, and let me prepare
Love with Thy children thus to share.
Silently now I wait for Thee,
Ready, my God, Thy will to see;
Open my heart, illumine me, Spirit Divine!'),
(327, 'I''d rather have Jesus than silver or gold;
I''d rather be His than have riches untold;
I''d rather have Jesus than houses or land;
I''d rather be led by His nail-pierced hand:

Refrain:
Than to be the king of a vast domain or be held in sin''s dread sway!
I''d rather have Jesus than anything this world affords today.

I''d rather have Jesus than men''s applause;
I''d rather be faithful to His dear cause;
I''d rather have Jesus than world-wide fame;
I''d rather be true to His holy name:

He''s fairer than lilies of rarest bloom;
He''s sweeter than honey from out the comb;
He''s all that my hungering spirit needs -
I''d rather have Jesus and let Him lead:'),
(328, 'Must Jesus bear the cross alone,
and all the world go free?
No, there''s a cross for everyone,
and there''s a cross for me.

The consecrated cross I''ll bear
till He shall set me free;
and then go home my crown to wear,
for there''s a crown for me.

Upon the crystal pavement, down
at Jesus'' pierced feet,
with joy I''ll cast my golden crown,
and His dear name repeat.'),
(329, 'Take the world, but give me Jesus;
All its Joys are but a name,
But His love abideth ever,
Through eternal years the same.

Refrain:
Oh, the height and depth of mercy!
Oh, the length and breadth of love!
Oh, the fullness of redemption,
Pledge of endless life above.

Take the world, but give me Jesus,
Sweetest comfort of my soul;
With my Savior watching o''er me,
I can sing, though billows roll.

Take the world, but give me Jesus;
Let me view his constant smile;
Then throughout my pilgrim journey
Light will cheer me all the while.

Take the world, but give me Jesus;
In His cross my trust shall be,
Till, with clearer, brighter vision
Face to face my Lord I see.'),
(330, 'Take my life, and let it be
Consecrated, Lord, to Thee;
Take my hands, and let them move
At the impulse of Thy love;
At the impulse of Thy love.

Take my feet, and let them be
Swift and beautiful for Thee.
Take my voice, and let me sing
Always, only, for my King;
Always, only, for my King.

Take my lips, and let them be
Filled with messages from Thee.
Take my silver and my gold:
Not a mite would I withhold;
Not a mite would I withhold.

Take my will, and make it Thine,
It shall be no longer mine;
Take my heart, it is Thine own,
It shall be Thy royal throne.
It shall be Thy royal throne.

Take my love, my Lord, I pour
At Thy feet its treasure store;
Take myself, and I will be,
Ever, only, all for Thee.
Ever, only, all for Thee.'),
(331, 'O Jesus, I have promised
to serve thee to the end;
be thou forever near me,
my Master and my friend.
I shall not fear the battle
if thou art by my side,
nor wander from the pathway
if thou wilt be my guide.

O let me feel thee near me!
The world is ever near;
I see the sights that dazzle,
the tempting sounds I hear;
my foes are ever near me,
around me and within;
but Jesus, draw thou nearer,
and shield my soul from sin.

O Jesus, thou hast promised
to all who follow thee
that where thou art in glory
there shall thy servant be.
And Jesus, I have promised
to serve thee to the end;
O give me grace to follow,
my Master and my Friend.'),
(332, 'Oh now I see the crimson wave,
The fountain deep and wide;
Jesus, my Lord, mighty to save,
Points to His wounded side.

Refrain:
The cleansing stream I see, I see,
I plunge, and O, it cleanseth me!
O praise the Lord! it cleanseth me,
It cleanseth me, yes, cleanseth me.

I see the new creation rise,
I hear the speaking blood;
It speaks polluted nature dies,
Sinks ''neath the cleansing flood.

I rise to walk in heaven''s own light,
Above the world and sin;
With heart made pure and garments white,
And Christ enthroned within.

Amazing grace! ''tis heaven below
To feel the blood applied,
And Jesus, only Jesus, know,
My Jesus crucified.'),
(333, 'On Jordan''s banks the Baptist''s cry
Announces that the Lord is nigh;
Awake and hearken, for he brings
Glad tidings of the King of kings!

Then cleansed be every life from sin;
Make straight the way for God within,
And let us all our hearts prepare
For Christ to come and enter there.

We hail You as our Savior, Lord,
Our refuge and our great reward;
Without Your grace we waste away
Like flow''rs that wither and decay.

Stretch forth Your hand, our health restore,
And make us rise to fall no more;
Oh, let Your face upon us shine
And fill the world with love divine.'),
(334, 'Come, thou Fount of every blessing,
Tune my heart to sing thy grace;
Streams of mercy, never ceasing,
Call for songs of loudest praise.
Teach me ever to adore Thee,
May I still Thy goodness prove,
While the hope of endless glory
Fills my heart with joy and love.

Here I raise mine Ebenezer;
Hither by thy help I''ve come;
And I hope, by thy good pleasure,
Safely to arrive at home.
Jesus sought me when a stranger,
Wandering from the fold of God;
He, to rescue me from danger,
Interposed his precious blood.

O, to grace how great a debtor
Daily I''m constrained to be!
Let thy goodness, like a fetter,
Bind me closer still to thee.
Prone to wander, Lord, I feel it,
Prone to leave the God I love;
Here''s my heart--O, take and seal it,
Seal it for thy courts above.'),
(335, 'Christ has for sin atonement made,
What a wonderful Saviour!
We are redeemed! the price is paid!
What a wonderful Savior!

Refrain:
What a wonderful Savior
is Jesus, my Jesus!
What a wonderful Savior
is Jesus, my Lord!

I praise Him for the cleansing blood,
What a wonderful Saviour!
That reconciled my soul to God;
What a wonderful Saviour!

He walks beside me all the way,
What a wonderful Saviour!
And keeps me faithful day by day;
What a wonderful Saviour!

He gives me overcoming power,
What a wonderful Saviour!
And triumph in each trying hour;
What a wonderful Saviour!'),
(336, 'There is a fountain filled with blood drawn from Emmanuel''s veins;
And sinners plunged beneath that flood lose all their guilty stains.
Lose all their guilty stains, lose all their guilty stains;
And sinners plunged beneath that flood lose all their guilty stains.

The dying thief rejoiced to see that fountain in his day;
And there may I, though vile as he, wash all my sins away.
Wash all my sins away, wash all my sins away;
And there may I, though vile as he, wash all my sins away.

Thou dying Lamb, Thy precious blood shall never lose its power
Till all the ransomed church of God are saved, to sin no more.
Are saved, to sin no more, are saved, to sin no more;
Till all the ransomed church of God are saved, to sin no more.

E''er since, by faith, I saw the stream Thy flowing wounds supply,
Redeeming love has been my theme, and shall be till I die.
And shall be till I die, and shall be till I die;
Redeeming love has been my theme, and shall be till I die.

Lord, I believe Thou hast prepared, unworthy though I be,
For me a blood-bought free reward, a golden harp for me!
A golden harp for me! A golden harp for me!
For me a blood-bought free reward, a golden harp for me!

There in a nobler, sweeter song, I''ll sing Thy power to save,
When this poor lisping, stammering tongue is ransomed from the the grave.
Is ransomed from the grave, is ransomed from the grace;
When this poor lisping, stammering tongue is ransomed from the the grave.'),
(337, 'Redeemed, how I love to proclaim it!
Redeemed by the blood of the Lamb;
Redeemed through His infinite mercy,
His child and forever I am.

Refrain:
Redeemed, redeemed,
Redeemed by the blood of the Lamb;
Redeemed, redeemed,
His child and forever I am.

Redeemed, and so happy in Jesus,
No language my rapture can tell;
I know that the light of His presence
With me doth continually dwell.

I know there''s a crown that is waiting
In yonder bright mansion for me;
And soon, with the spirit made perfect,
At home with the Lord I shall be.'),
(338, 'Redeemed, how I love to proclaim it!
Redeemed by the blood of the Lamb;
Redeemed thro'' His infinite mercy,
His child, and forever, I am.

Refrain:
Redeemed, redeemed,
Redeemed by the blood of the Lamb;
Redeemed, how I love to proclaim it!
His child and forever I am.

I think of my blessed Redeemer,
I think of Him all the day long;
I sing, for I cannot be silent;
His love is the theme of my song.

I know I shall see in His beauty
The King in whose law I delight,
Who lovingly guardeth my footsteps,
And giveth me songs in the night.'),
(339, 'God is my strong salvation,
What foe have I to fear?
In darkness and temptation,
My Light, my Help, is near:
Though hosts encamp around me,
Firm in the fight I stand;
What terror can confound me,
With God at my right hand?

Place on the reliance;
My soul with courage wait;
His truth be thine affiance,
When faint and desolate.
His might thy heart shall strengthen,
His love thy joy increase;
Mercy thy days shall lengthen;
The Lord will give thee peace.'),
(340, 'We have heard a joyful sound,
Jesus saves, Jesus saves;
Spread the gladness all around,
Jesus saves, Jesus saves;
Bear the news to every land,
Climb the steeps and cross the waves,
Onward, ''tis our Lord''s command,
Jesus saves, Jesus saves.

ft it on the rolling tide,
Jesus saves, Jesus saves;
Tell to sinners, far and wide,
Jesus saves, Jesus saves;
Sing, ye islands of the sea.
Echo back, ye ocean caves,
Earth shall keep her jubilee,
Jesus saves, Jesus saves.

ng above the battle''s strife,
Jesus saves, Jesus saves;
By His death and endless life,
Jesus saves, Jesus saves;
Sing it softly through the gloom,
When the heart for mercy craves,
Sing in triumph o''er the tomb,
Jesus saves, Jesus saves.

ve the winds a mighty voice,
Jesus saves, Jesus saves;
Let the nations now rejoice,
Jesus saves, Jesus saves;
Shout salvation full and free,
Highest hills and deepest caves,
This our song of victory,
Jesus saves, Jesus saves.'),
(341, 'To God be the glory, great things he hath done!
So loved he the world that he gave us his Son,
who yielded his life an atonement for sin,
and opened the lifegate that all may go in.

Refrain:
Praise the Lord, praise the Lord,
let the earth hear his voice!
Praise the Lord, praise the Lord,
let the people rejoice!
O come to the Father thru Jesus the Son,
and give him the glory, great things he hath done!

O perfect redemption, the purchase of blood,
to every believer the promise of God;
the vilest offender who truly believes,
that moment from Jesus a pardon receives.

Great things he hath taught us, great things he hath done,
and great our rejoicing thru Jesus the Son;
but purer, and higher, and greater will be
our wonder, our transport, when Jesus we see.'),
(342, 'Is this a day of new beginnings,
Time to remember and move on,
Time too believe what love is bringing,
Laying to rest the pain that''s gone?

How can the seasons of a planet
Mindlessly spinning round its sun
With just a human name and number
Say that some new thing has begun?

Yet through the life and death of Jesus
Love''s mighty Spirit, now as then,
Can make for us a world of difference
As faith and hope are born again.

Then let us, with the Spirit''s daring,
Step from the past and leave behind
Its disappointment, guilt, and grieving,
Seeking new paths, and sure to find.

Christ is alive, and goes before us
To show and share what love can do.
This is a day of new beginnings;
Our God is making all things new.'),
(343, 'I will sing of my Redeemer,
And His wondrous love to me;
On the cruel cross He suffered,
From the curse to set me free.

Refrain:
Sing, oh sing, of my Redeemer,
With His blood, He purchased me.
On the cross, He sealed my pardon,
Paid the debt, and made me free.

I will tell the wondrous story,
How my lost estate to save,
In His boundless love and mercy,
He the ransom freely gave.

I will sing of my Redeemer,
And His heavenly love to me;
He from death to life hath brought me,
Son of God with Him to be.'),
(344, 'I love thy kingdom, Lord,
the house of thine abode,
the church our blest Redeemer saved
with his own precious blood.

I love thy church, O God!
Her walls before thee stand
dear as the apple of thine eye,
and graven on thy hand.

Beyond my highest joy
I prize her heavenly ways,
her sweet communion, solemn vows,
her hymns of love and praise.

Sure as thy truth shall last,
to Zion shall be given
the brightest glories earth can yield,
and brighter bliss of heaven.'),
(345, 'Christ is the world''s true light,
Its captain of salvation,
The daystar clear and bright
Of every man and nation;
New life, new hope awakes
Where''er men own His sway:
Freedom her bondage breaks,
And night is turned to day.

In Christ all races meet,
Their ancient feuds forgeting,
The whole round world complete,
From sunrise to its setting:
When Christ is throned as Lord,
Men shall forsake their fear,
To plowshare beat the sword,
To pruning hook the spear.

One Lord, in one great name
Unite us all who own Thee,
Cast out our pride and shame
That hinder to enthrone Thee;
The world has waited long,
Has travailed long in pain,
To heal its ancient wrong,
Come, Prince of Peace, and reign.'),
(346, 'Lord, who dost give to Thy church for its healing
Gifts, and the grace to sustain and renew,
Hear as we pray that today and each morrow
We to Thy purpose may show ourselves true.

Clear be the voices of preachers and prophets
Fearlessly speaking the word of the Lord,
Word of redemption thro''God''s Son incarnate,
Blessing for cursing, and peace for the sword.

Tender and wise be the hearts of the pastors,
Guiding and guarding the souls in their care,
Firm with the wayward, a strength to the doubting,
Helping the needy their burdens to bear.

May those who teach grow in knowledge and patience,
Guiding to wisdom the young and the old,
Training for worship and witness and service,
Foes to all falsehood, in truthfulness bold.

Lord, ever give to us gifts in due measure,
Each needing other, and all having worth;
So to the Father, the Son, and the Spirit,
Glory be shown by the church here on earth.'),
(347, 'Built on the Rock the Church shall stand,
Even when steeples are falling;
Crumbled have spires in every land,
Bells still are chiming and calling-
Calling the young and old to rest,
Calling the souls of those distressed,
Longing for life everlasting.

Not in our temples made with hands
God, the Almighty, is dwelling;
High in the heav''ns  His temple stands,
All earthly temples exceling.
Yet He who dwells in heav''n above
Deigns to abide with us in love,
Making our bodies His temple.

We are God''s house of living stones,
Built for His own habitation;
He fills our hearts, His humble thrones,
Granting us life and salvation.
Were two or three to seek His face,
He in their midst would show His grace,
Blessings upon them bestowing.

Yet in this house, an earthly frame,
Jesus His children is blessing;
Hither we come to praise His name,
Faith in our Savior confessing.
Jesus to us His Spirit sent,
Making with us His covenant,
Granting His children the kingdom.

Thro''all the passing years, O Lord,
Grant that, when church bells are ringing,
Many may come to hear God''s Word
Where He this promise is bringing:
I know My own, My own know Me:
You, not the world, My face shall see;
My peace I leave with you. Amen.'),
(348, 'The church''s one foundation
is Jesus Christ her Lord;
she is his new creation
by water and the Word.
From heaven he came and sought her
to be his holy bride;
with his own blood he bought her,
and for her life he died.

Elect from every nation,
yet one o''er all the earth;
her charter of salvation,
one Lord, one faith, one birth;
one holy name she blesses,
partakes one holy food,
and to one hope she presses,
with every grace endued.

Though with a scornful wonder
we see her sore oppressed,
by schisms rent asunder,
by heresies distressed,
yet saints their watch are keeping;
their cry goes up, "How long?"
And soon the night of weeping
shall be the morn of song.

''Mid toil and tribulation,
and tumult of her war,
she waits the consummation
of peace forevermore;
till, with the vision glorious,
her longing eyes are blest,
and the great church victorious
shall be the church at rest.'),
(349, 'Here in Christ we gather,
love of Christ our calling.
Christ, our love, is with us,
gladness be His greeting
Let us fear Him, yes, and love Him,
God eternal.
Loving Him, let each love
Christ in all his brethren.

Refrain:
God is love, and where true love is
God Himself is there.

When we Christians gather,
members of one body,
Let there be in us no
discord but one spirit.
Banished now be anger,
strife, and every quarrel.
Christ, our God, be always
present here among us.

Grant us love''s fulfillment,
joy with all the blessed,
When we see Your face,
O Savior, in its glory.
Shine on us, O purest
Light of all creation,
Be our bliss while endless
ages sing Your praises.'),
(350, 'Blest be the tie that binds
our hearts in Christian love;
the fellowship of kindred minds
is like to that above.

Before our Father''s throne
we pour our ardent prayers;
our fears, our hopes, our aims are one,
our comforts and our cares.

We share each other''s woes,
our mutual burdens bear;
and often for each other flows
the sympathizing tear.

When we asunder part,
it gives us inward pain;
but we shall still be joined in heart,
and hope to meet again.')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(351, 'Thy hand, O God, has guided
Thy flock from age to age;
The wondrous tale is written
Full clear on every page;
Our fathers owned Thy goodness,
And we their deeds record;
And both of this bear witness,
One church, one faith, one Lord.

Thy heralds brought glad tidings
To greatest as to least;
They bade men rise and hasten
To share the great King''s feast:
And this was all their teaching,
In every deed and word,
To all alike proclaiming
One church, one faith, one Lord.

When shadows thick were falling,
And all seemed sunk in night,
Thou, Lord, did send Thy servants,
Thy chosen sons of light.
On them and on Thy people
Thy plenteous grace was poured,
And this was still their message:
One church, one faith, one Lord.

Thy mercy will not fail us,
Nor leave Thy work undone;
With Thy right hand to help us,
The vict''ry shall be won;
And then by men and angels
Thy name shall be adored,
And this shall be their anthem:
One church, one faith, one Lord.'),
(352, 'This is My will, My one command,
That love should dwell among you all.
This is My will that you should love
As I have shown that I love you.

No greater love a man can have
Than that he die to save his friends.
You are My friends if you obey
What I command that you should do.

You chose not Me, but I chose you
That you should go and bear much fruit.
I chose you out that you in Me
Should bear much fruit that will abide.

All that I ask My Father, dear,
For My name''s sake you shall receive.
This is My will, My one command,
That love should dwell in each, in all.'),
(353, 'Father, help Your people in this world to build
Something of Your kingdom and to do Your will,
Lead us to discover partnership in love;
Bless our ways of sharing and our pride remove.

Lord of desk and altar, bind our lives in one,
That in work and worship love may set the tone.
Give us grace to listen, clarity of speech;
Make us truly thankful for the gifts of each.

Holy is the setting of each room and yard,
Lecture hall and kitchen, office, shop, and ward.
Holy is the rhythm of our working hours;
Hallow then our purpose, energy, and pow''rs.

Strengthen, Lord, for service hand and heart and brain;
Help us good relations daily to maintain.
Let the living presence of the servant Christ
Heighten our devotion, make our life a feast.'),
(354, 'Thy love, O God, has all mankind created,
And led Thy people to this present hour;
In Christ we see life''s glory consummated;
Thy Spirit manifests His living power.

From out the darkness of our hope''s frustration,
From all the broken idols of our pride,
We turn to seek Thy truth''s illumination,
And find Thy mercy waiting at our side.

In pity look upon Thy children''s striving
For life and freedom, peace and brotherhood,
Till at the fullness of Thy truth arriving,
We find in Christ the crown of every good.

Inspire Thy church, mid earth''s discordant voices,
To preach the gospel of her Lord above,
Until the day this warring world rejoices
To hear the mighty harmonies of love.'),
(355, 'Where cross the crowded ways of life,
where sound the cries of race and clan,
above the noise of selfish strife,
we hear your voice, O Son of Man.

From tender childhood''s helplessness,
from woman''s grief, man''s burdened toil,
from famished souls, from sorrow''s stress,
your heart has never known recoil.

The cup of water given for you still
holds the freshness of your grace;
yet long these multitudes to view
the sweet compassion of your face.

O Master, from the mountainside
make haste to heal these hearts of pain;
among these restless throngs abide;
O tread the city''s streets again.

Till all the world shall learn your love
and follow where your feet have trod,
till, glorious from your heaven above,
shall come the city of our God.'),
(356, 'All who love and serve your city,
All who bear its daily stress,
All who cry for peace and justice,
All who curse and all who bless.

In your day of loss and sorrow,
In your day of helpless strife,
Honor, peace, and love retreating,
Seek the Lord, who is your life.

For all days are days of judgment,
And the Lord is waiting still,
Drawing near His friends who spurn Him,
Off''ring peace from Calv''ry''s hill.

Risen Lord, shall yet the city
Be the city of despair?
Come today, our judge, our glory;
Be its name "The Lord is there!"'),
(357, 'Come, labor on.
Who dares stand idle on the harvest plain
While all around him waves the golden grain?
And to each servant does the Master say,
"Go work today."

Come, labor on.
Claim the high calling angels cannot share;
To young and old the gospel gladness bear;
Redeem the time; its hours too swiftly fly.
The night draws nigh.

Come, labor on.
No time for rest; till glows the western sky,
Till the long shadows o''r our pathway lie,
And a glad sound comes with the setting sun,
"Well done, well done!"'),
(358, 'Far and near the fields are teeming
with the sheaves of ripened grain;
Far and near their gold is gleaming
O''er the summy slope and plain.

Refrain:
Lord of harvest, send forth reapers!
Hear us Lord,to Thee we cry;
Send them now the sheaves to gather,
Ere the harvest-time pass by.

Send them forth with morn''s first beaming,
Send them in the noon-tides''s glare;
When the sun''s last rays are streaming,
bid them gather everywhere.

O thou, whom thy Lord is sending,
gather now the sheaves of gold;
Heavenward then at evening wending
Thou shalt come with joy untold.'),
(359, 'Hark! the voice of Jesus calling,
"Who will go and work today?
Fields are white, the harvest waiting,
Who will bear the sheaves away?"
Loud and long the Master calleth,
Rich reward He offers free;
Who will answer, gladly saying,
"Here am I, O Lord, send me"?

If you cannot cross the ocean
And the heathen lands explore,
You can find the heathen nearer,
You can help them at your door;
If you cannot speak like angels,
If you cannot preach like Paul,
You can tell the love of Jesus,
You can say He died for all.

If you cannot be the watchman,
Standing high on Zion''s wall,
Pointing out the path to heaven,
Offering life and peace to all;
With your prayers and with your bounties
You can do what Heaven demands,
You can be like faithful Aaron,
Holding up the prophet''s hands.

While the souls of men are dying,
And the Master calls for you,
Let none hear you idly saying,
"There is nothing I can do!"
Gladly take the task He gives you,
Let His work your pleasure be;
Answer quickly when He calleth,
"Here am I, O Lord, send me."'),
(360, 'From the eastern mountains Pressing on they come,
Wise men in their wisdom, To His humble home;
Stirred by deep devotion, Hasting from afar,
Ever journeying onward, Guided by a star.

There their Lord and Savior Meek and lowly,
Wondrous light that led them Onward on their way,
Ever now to lighten Nations from afar,
As they journey homeward By that guiding star.

Gather in the outcasts All who''ve gone astray,
Throw Thy radiance o''er them, Guide them on their way;
Those who never knew Thee, Those who''ve wandered far,
Guide them by the brightness  Of Thy guiding star.

Until every nation, Whether bond or free,
''Neath Thy starlit banner, Jesus follows thee.
O''er the distant mountains To that heavenly home,
Where no sin nor sorrow Evermore shall come.'),
(361, 'Hark! ''tis the Shepherd''s voice I hear,
Out in the desert dark and drear,
Calling the sheep who''ve gone astray,
Far from the Shepherd''s fold away.

Refrain:
Bring them in, Bring them in,
Bring them in from the fields of sin;
Bring them in, Bring them in,
Bring the wanderers to Jesus.

Who''ll go and help the Shepherd kind,
Help Him the wandering ones to find?
Who''ll bring them back into the fold,
Where they''ll be sheltered from the cold?

Out in the desert hear their cry,
Out on the mountain wild and high,
Hark! ''tis the Master speaks to thee,
"Go, find My sheep where ''er they be."'),
(362, 'Come, Christians, follow where our Captain trod,
Our King victorious, Christ, the Son of God.

Refrain:
Lift high the cross, the love of Christ proclaim,
Till all the world adore His sacred Name.

Led on their way by this triumphant sign,
The hosts of God in conquering ranks combine.

All newborn soldiers of the Crucified
Bear on their brows the seal of Him Who died.

O Lord, once lifted on the glorious tree,
As Thou hast promised, draw us all to Thee.

So shall our song of triumph ever be:
Praise to the Crucified for victory!'),
(363, 'Lord, whose love in humble service
Bore the weight of human need,
Who upon the cross, forsaken,
Worked Your mercy''s perfect deed:
We, Your servants, bring the worship
Not of voice alone, but heart;
Consecrating to Your purpose
Every gift which You impart.

Still Your children wander homeless;
Still the hungry cry for bread;
Still the captives long for freedom;
Still in grief we mourn our dead.
As you, Lord, in deep compassion
Healed the sick and freed the soul,
By Your Spirit send Your power
To our world to make it whole.

As we worship, grant us vision,
Till your love''s revealing light
In its height and depth and greatness
Dawns upon our quickened sight,
Making known the needs and burdens
Your compassion bids us bear,
Stirring us to ardent service,
Your abundant life to share.'),
(364, 'O Jesus Christ, to You may hymns be rising
In every city for Your love and care;
Inspire our worship, grant the glad surprising
That Your blest Spirit brings men everywhere.

Grant us new courage, Vsacrificial, humble,
Strong in Your strength to venture and to dare,
To lift the fallen, guide the feet that stumbe,
Seek out the lonely and God''s mercy share.

Show us Your Spirit, brooding o''er each city,
As You did weep above Jerusalem,
Seeking to gather all in love and pity,
And healing those who touch Your garment''s hem.'),
(365, 'O Zion, haste, thy mission high fulfilling,
to tell to all the world that God is light,
that he who made all nations is not willing
one soul should perish, lost in shades of night.

Refrain:
Publish glad tidings, tidings of peace;
tidings of Jesus, redemption and release.

Proclaim to every people, tongue, and nation
that God, in whom they live and move, is love;
tell how he stooped to save his lost creation,
and died on earth that we might live above.

Give of thine own to bear the message glorious;
give of thy wealth to speed them on their way;
pour out thy soul for them in prayer victorious;
O Zion, haste to bring the brighter day.

He comes again; O Zion, ere thou meet Him,
Make known to every heart His saving grace;
Let none whom He hath ransomed fail to greet Him,
Through thy neglect, unfit to see His face.'),
(366, 'O where are the reapers that garner in
The sheaves of the good from the fields of sin?
With sickles of truth must the work be done,
And no one may rest till the "harvest home."

Refrain:
Where are the reapers? O who will come
And share in the glory of the "harvest home"?
O who will help us to garner in
The sheaves of good from the fields of sin?

The fields all are ripening, and far and wide
The world now is waiting the harvest tide:
But reapers are few, and the work is great,
And much will be lost should the harvest wait.

So come with your sickles, ye sons of men,
And gather together the golden grain;
Toil on till the Lord of the harvest come,
Then share ye His joy in the "harvest home."'),
(367, 'Rescue the perishing, care for the dying,
snatch them in pity from sin and the grave;
weep o''er the erring one, lift up the fallen,
tell them of Jesus, the mighty to save.

Refrain:
Rescue the perishing, care for the dying;
Jesus is merciful, Jesus will save.

Though they are slighting him, still he is waiting,
waiting the penitent child to receive;
plead with them earnestly, plead with them gently;
he will forgive if they only believe.

Rescue the perishing, duty demands it;
strength for thy labor the Lord will provide;
back to the narrow way patiently win them;
tell the poor wanderer a Savior has died.'),
(368, 'Watchman, blow the gospel trumpet,
Every soul a warning give;
Whosoever hears the message
May repent, and, turn and live.

Refrain:
Blow the trumpet, trusty watchman,
Blow it loud o''er land and sea;
God commissions, sound the message!
Every captive may be free.

Sound it loud o''r every hilltop,
Gloomy shade and sunny plain;
Ocean depths repeat the message,
Full salvation''s glad refrain.

Sound it in the hedge and highway,
Earth''s dark spots where exiles roam;
Let it tell all things are ready,
Father waits to welcome home.

Sound it for the heavy laden,
Weary, longing to be free;
Sound a Savior''s invitation,
Sweetly saying, "Come to me."'),
(369, 'Sowing in the morning, sowing seeds of kindness,
Sowing in the noontide and the dewy eve,
Waiting for the harvest and the time of reaping -
We shall come rejoicing, bringing in the sheaves.

Refrain:
Bringing in the sheaves, bringing in the sheaves,
We shall come rejoicing, bringing in the sheaves.
Bringing in the sheaves, bringing in the sheaves,
We shall come rejoicing, bringing in the sheaves.

Sowing in the sunshine, sowing in the shadows,
Fearing neither clouds nor winter''s chilling breeze;
By and by the harvest and the labor ended -
We shall come rejoicing, bringin in the sheaves.

Going forth with weeping, sowing for the Master,
Tho the loss sustained our spirit often grieves;
When our weeping''s over He will bid us welcome -
We shall come rejoicing, bringing in the sheaves'),
(370, 'Christ for the world we sing,
the world to Christ we bring,
with loving zeal;
the poor, and them that mourn,
the faint and overborne,
sinsick and sorrow-worn,
whom Christ doth heal.

Christ for the world we sing,
the world to Christ we bring,
with fervent prayer;
the wayward and the lost,
by restless passions tossed,
redeemed at countless cost,
from dark despair.

Christ for the world we sing,
the world to Christ we bring,
with joyful song;
the newborn souls, whose days,
reclaimed from error''s ways,
inspired with hope and praise,
to Christ belong.'),
(371, 'Lift Him up, ''tis He that bids you,
Let the dying look and live;
To all weary, thirsting sinners,
Living waters will He give;
And though once so meek and lowly,
Yet the Prince of heaven was He;
And the blind, who grope in darkness,
Through the blood of Christ shall see.

Refrain:
Lift Him up, the risen Savior,
High amid the waiting throng;
Lift Him up, ''tis He that speaketh,
Now He bids you flee from wrong.

Lift Him up, this precious Savior,
Let the multitude behold;
They with willing hearts shall seek Him,
He will draw them to His fold;
They shall gather from the wayside,
Hastening on with joyous feet,
They shall bear the cross of Jesus,
And shall find salvation sweet.

Lift Him up in all His glory,
''Tis the Son of God on high;
Lift Him up, His love shall draw them,
E''n the careless shall draw nigh;
Let them hear again the story
Of the cross, the death of shame;
And from tongue to tongue repeat it;
Mighty throngs shall bless His name.

O then lift Him up in singing,
Lift the Savior up in prayer;
He, the glorious Redeemer,
All the sins of men did bear;
Yes, the young shall bow before Him,
And the old their voices raise;
All the deaf shall hear hosannah;
And the dumb shall shout His praise.'),
(372, 'How beauteous are their feet
Who stand on Zion''s hill;
Who bring salvation on their tongues,
And words of peace reveal!

How charming is their voice,
So sweet the tidings are:
"Zion, behold thy Savior King;
He reigns and triumphs here!"

How happy are our ears,
That hear the joyful sound
Which kings and prophets waited for,
And sought, but never found!

How blessed are our eyes,
That see this heavenly light;
Prophets and kings desired it long,
But died without the sight!

The watchmen join their voice,
And tuneful notes employ;
Jerusalem breaks forth in songs,
And deserts learn the joy.'),
(373, 'Seeking the lost, yes, kindly entreating
Wanderers on the mountain astray;
"Come unto Me," His message repeating,
Words of the Master speaking today.

Refrain:
Going afar (going afar)
Upon the mountain (upon the mountain)
Bringing the wanderer back again, back again,
Into the fold (into the fold)
Of my Redeemer (of my Redeemer)
Jesus the Lamb for sinners slain, for sinners slain.

Seeking the lost and pointing to Jesus
Souls that are weak and hearts that are sore,
Leading them forth in ways of salvation,
Showing the path to life evermore.

Thus would I go on missions of mercy,
Following Christ from day unto day,
Cheering the faint and raising the fallen,
Pointing the lost to Jesus, the Way.'),
(374, 'Jesus, with Thy church abide;
Be her Savior, Lord, and Guide,
While on earth her faith is tried:
We beseech Thee, hear us.

May her voice be ever clear,
Warning of a judgment near,
Telling of a Savior dear:
We beseech Thee, hear us.

May she guide the poor and blind,
Seek the lost until she find,
And the broken hearted bind:
We beseech Thee, hear us.

May she holy triumps win,
Overthrow the hosts of sin,
Gather all the nations in:
We beseech Thee, hear us.'),
(375, 'Work for the night is coming,
Work through the morning hours;
Work while the dew is sparkling;
Work ''mid springing flow''rs.
Work when the day grows brighter,
Work in the glowing sun;
Work for the night is coming,
When man''s work is done.

Work for the night is coming,
Work thro'' the sunny noon;
Fill brightest hours with labor,
Rest comes sure and soon.
Give every flying minute
Something to keep in store;
Work for the night is coming,
When man works no more.

Work for the night is coming,
Under the sunset skies;
While their bright tints are glowing,
Work for daylight flies.
Work till the last beam fadeth,
Fadeth to shine no more;
Work while the night is dark''ning,
When man''s work is o''er.'),
(376, 'All things are Thine; no gift have we,
Lord of all gifts, to offer Thee;
And hence with grateful hearts today,
Thine own before Thy feet we lay.

Thy will was in the builder''s thought;
Thy hand unseen amidst us wrought;
Thro'' mortal motive, scheme and plan,
Thy wise, eternal purpose ran.

No lack Thy perfect fullness knew;
For human needs and longings grew
This house of prayer- this home of rest.
Here may Thy saints be often blessed.

In weakness and in want we call
On Thee, for whom the heav''ns are small;
Thy glory is Thy children''s good,
Thy joy Thy tender Fatherhood.

O Father! deign these walls to bless;
Make this the abode of righteousness,
And let these doors a gateway be
To lead us from ourselves to Thee!'),
(377, 'Go forth, go forth with Christ,
Who called you to this day,
He who has led, will lead
And keep you in His way:
His word is fast, His promise sure
To all who serve Him and endure.

Go forth, go forth with Christ,
With purpose not your own,
Each vict''ry you shall gain
Through Him your Lord alone:
To guard you in fidelity
His Spirit shall your strength''ner be.

Go forth, go forth with Christ,
His Priesthood you shall share,
Who bought us by His blood
To be His servants here:
Walk in the way your Savior trod,
Go forth with Him, go forth with God.'),
(378, '"Go, preach My gospel," saith the Lord;
"Bid the whole world My grace receive;
He shall be saved who trusts My word,
And they condemned who disbelieve.

"I''ll make your great commission known,
And ye shall prove My gospel true
By all the works that I have done,
By all the wonders ye shall do.

"Teach all the nations My commands;
I''m with you till the world shall end;
All power is vested in My hands;
I can destroy, and I defend."

He spake, and light shone round His head;
On a bright cloud to heaven He rode;
They to the farthest nations spread
The grace of their ascended Lord.'),
(379, 'We give this child to You,
Our precious gift of love.
Help us to lead each step aright
With guidance from above.

O bless each child of Yours,
And grant when they are grown,
They will have learned to love Your way,
And choose it for their own.

We give ourselves to You,
And may Your Spirit fill
Our hearts and home, that all we do
Be subject to Your will.'),
(380, 'Welcome, day of sweet repose!
Blessed be thy sacred hours!
We would trust the One who knows
All our weak and failing powers.

Welcome, day in Eden born!
Holy rest for sinless man!
Like the dawning of fair morn
Come thy hours to us again.

Welcome, day blessed by our Lord!
Toil shall cease and anxious care.
Day commanded by His word,
Day for song and praise and prayer.

Welcome, day our Savior kept!
Keeping, wrought our righteousness,
Day God bids us ne''er forget,
Day of days His name to bless.'),
(381, 'Holy Sabbath day of rest,
By our Master richly blest,
God created and divine,
Set aside for holy time.

Refrain:
Yes, the holy Sabbath rest,
By our God divinely blest,
It to us a sign shall be
Throughout all eternity.

Seek not pleasures of this earth,
With its folly, noise, and mirth,
There are better things in store,
Over on the other shore.

As the Sabbath draweth on
Friday eve at set of sun,
Christian household then should meet,
Sing and pray at Jesus''feet.

Asking Him for saving grace,
Also vict''ry in the race,
And to help us by His pow''r,
To keep holy every hour.'),
(382, 'O day of rest and gladness,
O day of joy and light,
O balm of care and sadness,
most beautiful, most bright;
on thee, the high and lowly,
who bend before throne,
sing, "Holy, holy, holy,"
to the Eternal One.

Thou art a port protected
from storms that round us rise;
a garden intersected
with streams of paradise;
thou art a cooling fountain
in life''s dry, dreary sand;
from thee, like Pisgah''s mountain,
we view our promised land.

A day of sweet reflection,
thou art a day of love,
A day to raise affection
from earth to things above.
New graces ever gaining
from this our day of rest,
We reach the rest remaining
in mansions of the blessed.'),
(383, 'O day of rest and gladness,
O day of joy and light,
O balm of care and sadness,
Most beautiful, most bright,
On thee the high and lowly
Before th'' eternal throne
Sing, "Holy, holy, holy,"
To the great Three in One.

Thou art a port protected
From storms that round us rise;
A garden intersected
With streams of paradise;
Thou art a cooling fountain
In life''s dry dreary sand;
From Thee, like Pisgah''s mountain,
We view our promised land.

A day of sweet reflection
Thou art, a day of love,
A day to raise affection
From earth to things above.
New graces ever gaining
From this our day of rest,
We seek the rest remaining
To mansions of the blest.'),
(384, 'Safely through another week
God has brought us on our way;
Let us now a blessing seek,
Waiting in His courts today;
Day of all the week the best,
Emblem of eternal rest:
Day of all the week the best,
Emblem of eternal rest.

While we seek supplies of grace,
Thro'' the dear Redeemer''s name,
Show Thy reconciling face;
Take away the sin and shame:
From our worldly cares set free,
May we rest this day in Thee:
From our worldly cares set free,
May we rest this day in Thee.

When the more shall bid us rise,
May we feel Thy presence near;
May Thy glory meet our eyes,
While we in Thy house appear:
Here afford us, Lord, a taste
Of our everlasting feast:
Here afford us, Lord, a taste
Of our everlasting feast.

May the gospel''s joyful sound
Conquer sinners, comfort saints;
Make the fruits of grace abound,
Bring relief to all complaints:
Thus may all our Sabbaths be,
Till we we rise to reign with Thee.
Thus may all our Sabbaths be,
Till we we rise to reign with Thee.'),
(385, 'Crowning jewel of creation,
Blest and hallowed, sanctified;
Time and changes all transcending,
Shared forever, glorified.

Refrain:
Blessed Sabbath made for man,
Gift from the Creator''s hand.

Sin and sickness, prayer and weeping
Cease at close of earthly days;
But Thy Sabbath is eternal,
Joyful thanks to Thee we raise!

Teach us Lord, in storm or sunshine
How to truly rest in Thee,
May Thy Sabbath peace enfold us
And our shelter ever be.'),
(386, 'The sacred anthem slowly rang
Across the fields of praise,
When earth''s first Sabbath made complete
All creatures and all days.
Walking with God, there,
Woman and man together share
The blessed Sabbath mood;
And in that green and golden world
Know all God''s works are good.

But now in our diminished lives
We sing a blemished song;
The earth is worn and disarrayed
And all our work goes wrong.
Still in our worship,
Joining in praise and fellowship,
By Sabbath radiance blessed,
We put our doubt and fear away
And rest within God''s rest.

And arching over time and space
The Lord of Sabbaths wills
Renewal for the weary earth
And healing for our ills.
Hearts will rejoice then;
There will be no more weeping, when
We know and shall be known.
With hosts of the redeemed we''ll sing
Around God''s shining throne.'),
(387, 'Peace and healing on thy wing;
And to every troubled breast
Speak of the divine behest:
Thou shalt rest, Thou shalt rest!

Earthly longings bid retire,
Quench the passions'' hurtful fire;
To the wayward, sin oppressed,
Bring thou thy divine behest:
Thou shalt rest, Thou shalt rest!

Wipe from every cheek the tear,
Banish care and silence fear;
All things working for the best,
Teach us the divine behest:
Thou shalt rest, Thou shalt rest!'),
(388, 'Don''t forget the Sabbath,
The Lord our God hath blest,
Of all the week the brightest,
Of all the week the best;
It brings repose from labor,
It tells of joy divine,
Its beams of light descending,
With heavenly beauty shine.

Refrain:
Welcome, welcome, ever welcome,
Blessed Sabbath day,
Welcome, welcome, ever welcome,
Blessed Sabbath day.

Keep the Sabbath holy,
And worship Him today,
Who said to His disciples,
"I am the living way;"
And if we meekly follow
Our Savior here below,
He''ll give us of the fountain
Whose streams eternal flow.

Day of sacred pleasure!
Its golden hours we''ll spend
In thankful hymns to Jesus,
The children''s dearest Friend;
O gentle loving, Savior,
How good and kind Thou art,
How precious is Thy promise
To dwell in every heart!'),
(389, 'Light of light, enlighten me,
Now anew the day is dawning;
Sun of grace, the shadows flee;
Brighten Thou my Sabbath morning;
With Thy joyous sunshine blest,
Happy is my day of rest.

Let me with my heart today,
Holy, holy, holy, singing,
Rapt awhile from earth away,
All my soul to Thee up springing,
Have a foretaste inward given
How they worship Thee in heaven.

Hence all care, all vanity!
For the day to God is holy;
Come, Thou glorious Majesty,
Deign to fill this temple lowly;
Nought today my soul shall move,
Simply resting in Thy love.'),
(390, 'We love Thy Sabbath, Lord,
And worship at Thy will;
Oh may these hours sweet peace afford
And deeper faith instill.

Thine angels sang for joy
Cration''s work to see;
We too, this day, would raise our hearts
In grateful praise to Thee.

Praise for Thy wondrous love,
That sealed this sacred day,
A sign that all may understand
We own Thy sovereign sway.

O great Creator King,
Through Thy redeeming grace,
Renew and sanctify our hearts
That we may see Thy face.

And with the white-robed throng,
Upon Mount Sion be,
And joyful sing our Sabbath song
Through all eternity.'),
(391, 'To the world in kindness given;
Welcome to this humble breast,
As the beaming light from heaven.

Day of calm and sweet repose,
Gently now thy moments run;
Balm to soothe our cares and woes,
Till our labor here is done.

Holy day that most we prize,
Day of solemn praise and prayer,
Day to make the simple wise,
O, how great thy blessings are!

Welcome, welcome, day of rest,
With thy influence all divine;
May thy hallowed hours be blessed
to this waiting heart of mine.'),
(392, 'Dear Lord, we come at set of sun,
And at Your feet we kneel
To worship You, Creator, King,
This day, Your sign and seal.

Our earthly tasks we lay aside,
According to Your Word,
To enter now Your holy rest,
The Sabbath of the Lord.

Sweet Sabbath rest, your sacred hours
Are as a golden chain
That reaches back to Eden''s gate
And points us home again.

And when this earth shall be renewed,
And sin and death destroyed,
Shall all redeemed each Sabbath day
Still meet to praise their God.'),
(393, 'Lord of the Sabbath and its light,
I hail Thy hallowed day of rest;
It is my weary soul''s delight,
The solace of my careworn breast,
The solace of my careworn breast.

O sacred day of peace and joy,
Thy hours are ever dear to me;
Ne''er may a sinful thought destroy
The holy calm I find in thee,
The holy calm I find in thee.

How sweetly now they glide along!
How hallowed is the calm they yield!
Transporting is their rapturous song,
And heavenly visions seem revealed,
And heavenly visions seem revealed.

O Jesus, let me ever hail
Thy presence with the day of rest;
Then will Thy servant never fail
To deem Thy Sabbath doubly blest,
To deem Thy Sabbath doubly blest.'),
(394, 'Far from all care we hail the Sabbath morning;
O''er waving fields and from the distant sea
Swell notes of praise in harmony resounding
As all creation turns her heart to Thee.

Though man alone, Lord, of Thy great creation
Fails now to laud Thee for Thy love and power,
Yet still a remnant love Thee and remember
Thy holy law and each sweet Sabbath hour.

Lord of the Sabbath, Savior and Creator,
Calm now the throbbings of each troubled breast.
Speak to our hearts the peace of Thy commandments,
Breathe on each soul fair Eden''s hallowed ret.

Strong in Thy might and quiet in Thy meekness,
May we Thine image bear from day to day.
Then may we enter pearly gates eternal
And sing redemption''s song each Sabbath day.'),
(395, 'As birds unto the genial homeland fly,
The winter''s cold and low''ring skies to flee,
So seeks my soul Thy gracious presence here
And finds, O God, its rest and peace in Thee.

Here at Thy shrine we leave all vexing care,
For get the disappointment, grief and tear,
And on the wings of hopeful song and prayer
We rise, and rising feel Thy Spirit here.

Bless all who spend this night in pain and woe,
The burdened heart, the fainting, and distressed,
Thy comfort send to darkened homes bereaved,
Thy saving help to those by want oppressed.

Come, Sabbath joy, each trusting heart now fill,
And blissful peace within our homes abide,
May thankful praise each grateful heart now thrill,
And to God''s loving care their lives confide.'),
(396, 'Lord God, Your love has called us here,
As we, by love, for love were made.
Your living likeness still we bear
Tho''marred, dishonored, disobeyed.
We come, with all our heart and mind
Your call to hear, Your love to find.

We come with self inflicted pains
Of broken trust and chosen wrong,
Half free, half bound by inner chains,
By social forces swept along,
By powers and systems close confined,
Yet seeking hope for human kind.

Lord God, in Christ You call our name,
And then receive us as Your own,
Not thro'' some merit, right, or claim,
But by Your gracious love alone.
We strain to glimpse Your mercy seat,
And find You kneeling at our feet.

Then take the towel, and break the bread,
And humble us, and call us friends.
Suffer and serve till all are fed
And show how grandly love intends
To work till all creation sings,
To fill all worlds, to crown all things.

Lord God, in Christ You set us free
Your life to live, Your joy to share.
Give us Your Spirit''s liberty
To turn from guilt and dull despair
And offer all that faith can do,
While love is making all things new.'),
(397, 'An upper room did our Lord prepare
For those loved until the end:
And His disciples still gather there,
To celebrate their risen Friend.

And after supper He washed their feet,
For service, too, is sacrament.
In Him our joy shall be made complete
Sent out to serve, as He was sent.

A lasting gift Jesus gave His own:
To share His bread, His loving cup.
Whatever burdens may bow us down,
He by His cross shall lift us up.

No end there is! we depart in peace.
He loves beyond our uttermost:
In every room in our Father''s house,
He will be there, as Lord and host.'),
(398, 'Bread of the world in mercy broken,
Wine of the soul in mercy shed,
By whom the words of life are spoken,
And in whose death our sins are dead;

Look on the heart by sorrow broken,
Look on the tears by sinners shed;
And be Thy feast to us the token
That by Thy grace our souls are fed. Amen.'),
(399, 'Beneath the forms of outward rite
Thy supper, Lord, is spread
In every quiet upper room
Where fainting souls are fed.

The bread is always consecrate
Which men divide with men;
And every act of brotherhood
Repeats Thy feast again.

The blessed cup is only passed
True memory of Thee,
When life anew pours out its wine
With rich sufficiency.

O Master, through these symbols shared,
Thine own dear self impart,
That in our daily life may flame
The passion of Thy heart.'),
(400, 'I come with joy to meet my Lord,
Forgiven, loved and free,
In awe and wonder to recall
His life laid down for me,
His life laid down for me.

I come with Christians far and near
To find, as all are fed,
Our true community of love
In Christ''s communion bread,
In Christ''s communion bread.

As Christ breaks bread for us to share
Each proud division ends.
That love that made us makes us one,
And strangers now are friends,
And strangers now are friends.

And thus with joy we meet our Lord.
His presence always near,
Is in such friendship better known:
We see and praise Him here,
We see and praise Him here.

Together met, together bound,
We''ll go our diff''rent ways,
And as His people in the world,
We''ll live and speak His praise,
We''ll live and speak His praise.'),
(401, 'In imitation, Lord, of Thee,
This solemn service we repeat;
For Thine example full of grace,
Has made this humble duty sweet.

Renew each sacred spark of love,
And vitalize the holy flame;
May union strong our hearts unite
While this we do in Jesus'' name.

Our great example Thou shalt be,
In washing Thy disciples feet;
And as we follow Thy command,
Make Thou our fellowship complete.'),
(402, 'By Christ redeemed, In Christ restored,
We keep the memory adored,
And show the death of our dear Lord,
Until He come.

His broken body in our stead Is here,
In this memorial bread;
And so our feeble love is fed,
Until He come.

His fearful drops of agony,
His life blood shed for us we see;
The wine shall tell the mystery,
Until He come.

And thus that dark betrayal night,
With the last advent unite----
The shame, the glory, by this rite,
Until He come.'),
(403, 'Let us break bread together on our knees,
let us break bread together on our knees.
When I fall on my knees with my face to the rising sun,
O Lord, have mercy on me.

Let us drink wine together on our knees,
let us drink wine together on our knees.
When I fall on my knees with my face to the rising sun,
O Lord, have mercy on me.

Let us praise God together on our knees,
let us praise God together on our knees.
When I fall on my knees with my face to the rising sun,
O Lord, have mercy on me.'),
(404, 'Now let us from this table rise
Renewed in body, mind, and soul;
With Christ we die and live again,
His selfless love has made us whole.

With minds alert, upheld by grace,
To spread the word in speech and deed,
We follow in the steps of Christ,
At one with all in hope and need.

To fill each human house with love,
It is the sacrament of care;
The work that Christ began to do
We humbly pledge ourselves to share.

Then grant us courage, Father God,
To choose again the pilgrim way
And help us to accept with joy
The challenge of tomorrow''s day.'),
(405, 'O God, unseen, yet ever near,
Reveal Thy presence now
While we in love that hath no fear,
Before Thy glory bow.

Here may Thy faithful people know
The blessings of Thy love,
The streams that thro''  the dessert  flow,
The manna from above.

We come, obedient to Thy Word
To  feast on heav''nly food,
Our meat, the body of our Lord,
Our drink, His precious blood.

Thus may we all Thy words obey,
For we, O God, are Thine,
And go rejoicing on our way,
Renewed by strength divine.'),
(406, 'Love consecrates the humblest act
And haloes mercy''s deeds;
It sheds a benediction sweet
And hallows human needs.

When in the shadow of the cross
Christ knelt and washed the feet
Of His disciples, He gave us
A sign of love complete.

Love serves and willing, stoops to serve;
What Christ in love so true
Has freely done for one and all,
Let us now gladly do!'),
(407, 'Sent forth by God''s blessing, Our true faith confessing,
The people of God from His dwelling take leave.
The supper is ended. Oh, now be extended
The fruits of this service in all who believe.
The seed of His teaching, Receptive souls reaching,
Shall blossom in action for God and for all.
His grace did invite us, His love shall unite us
To work for God''s kingdom and answer His call.

With praise and thanks giving To God ever living,
The tasks of our everyday life we will face.
Our faith ever sharing, In love ever caring,
Embracing His children of each tribe and race.
With Your feast You feed us, With Your light now lead us;
Unite us as one in this life that we share.
Then may all the living With praise and thanks giving
Give honor to Christ and His name that we bear.'),
(408, 'Lord, enthroned in heav''nly splendor,
First begotten from the dead,
You alone, our strong defender,
Lifting up Your people''s head.
Alleluia, Jesus, true and  living Bread!

Tho'' the lowliest form now veil You
As of old in Bethlehem,
Here as there Your angels hail You
Branch and flow''r of Jesse''s stem.
Alleluia, We in worship join with them.

Paschal Lamb, Your off''ring finished
Once for all when You were slain,
In its fullness undiminished
Shall forever more remain.
Alleluia, Cleansing souls from every stain.

Life imparting heav''nly manna,
Stricken rock with streaming side,
Heav''n and earth with loud hosanna
Worship You the Lamb who died.
Alleluia, Ris''n, ascended, glorified!'),
(409, 'Jesus invites His saints
To meet around His board,
And sup in memory of the death
And sufferings of their Lord.

Faith eats the bread of life,
And drinks the living wine;
It looks beyond this scene of strife
Unites us to the Vine.

We take the bread and wine
As emblems of Thy death;
Lord, raise our souls above the sign,
To feast on Thee by faith.

Soon shall the night be gone,
Our Lord will come again;
The marriage supper of the Lamb
Will usher in His reign.'),
(410, 'Thy broken body, gracious Lord,
Is shadowed by this broken bread;
The wine which in this cup is poured,
Points to the blood which Thou hast shed.

And while we meet together thus,
We show that we are one in Thee;
Thy precious blood was shed for us,
Thy death, O Lord, hast set us free!

We have one hope that Thou wilt come,
Thee in the air we wait to see;
When Thou wilt give Thy saints a home,
And we shall ever reign with Thee.'),
(411, 'The Son of God proclaim,
The Lord of time and space;
The God who bade the light break forth
Now shines in Jesus'' face.

Behold His out stretched  hands,
Though all was in His power
He took the towel and basin then,
And serves us in this hour.

He, God''s creative word,
The church''s Lord and head,
Here bids us gather as His friends,
And share His wine and bread.

The Lord of life and death
With wondering praise we sing;
We break the bread at His command,
And name Him God and King.

We take this cup in hope:
For He, who gladly bore
The shameful cross, is ris''n again,
And reigns forevermore.'),
(412, 'Look upon Jesus, sinless is He;
Father, impute His life unto me.
My life of scarlet, my sin and woe,
Cover with His life, whiter than snow.

Refrain:
Cover with His life, whiter than snow;
Fullness of His life then shall I know;
My life of scarlet, my sin and woe,
Cover with His life, whither than snow.

Deep are the wounds transgression has made;
Red are the stains; my soul is afraid.
O to be covered, Jesus, with Thee,
Safe from the law that now judgeth me!

Longing the joy of pardon to know;
Jesus holds out a robe white as snow;
"Lord, I accept it! Leaving my own,
Gladly I wear Thy pure life alone."

Reconciled by His death for my sin,
Justified by His life pure and clean,
Sanctified by obeying His word,
Glorified when returneth my Lord.'),
(413, 'God has spoken by His prophets,
Spoken His unchanging Word,
Each from age to age proclaiming
God, the one, the righteous Lord.
Mid the world''s despair and turmoil,
One firm anchor holding fast;
God is King, His throne eternal,
God the first, and God the last.

God has spoken by Christ Jesus,
Christ, the everlasting Son,
Brightness of the Father''s glory,
With the Father ever one;
Spoken by the Word incarnate,
God of God, ere time began,
Light of light, to earth descending,
Man, revealing God to man.

God yet speaks by His own Spirit
Speaking to the hearts of men,
In the age-long Word expounding
God''s own message, now as then;
Through the rise and fall of nations
One sure faith yet standing fast,
God is King, His Word unchanging,
God the first, and God the last.'),
(414, 'Fruitful trees, the Spirit''s sowing,
May we ripen and increase,
Fruit to life eternal growing,
Rich in love and joy and peace.

Laden branches freely bearing
Gifts the Giver loves to bless;
Here is fruit that grows by sharing,
Patience, kindness, gentleness.

Rooted deep in Christ, our Master,
Christ, our pattern and our goal,
Teach us, as the years fly faster,
Goodness, faith, and self control.

Fruitful trees, the Spirit''s tending,
May we grow till harvests cease;
Till we taste, in life unending,
Heaven''s love and joy and peace.'),
(415, 'Christ, the Lord, all power possessing,
Parting, mounted heaven''s height,
Gracious hands outstretched in blessing,
Clouds received His from their sight.
Christ ascended, Christ ascended,
Christ ascended on the clouds. <i>(on the clouds)</i>
Christ ascended on the clouds.

Daniel views earth''s judgment hour,
Angels gathering open books.
God enthroned inflaming power
For His Son''s arrival looks.
Christ approaches, Christ approaches,
Christ approaches on the clouds. <i>(on the clouds)</i>
Christ approaches on the clouds.

Revelation''s word fulfilling,
Trumpet, voices pierce the air.
Saint and sinner fainting, thrilling,
Every eye behold Him there.
Christ is coming, Christ is coming,
Christ is coming on the clouds. <i>(on the clouds)</i>
Christ is coming on the clouds.'),
(416, 'The judgment has set, the books have been opened;
How shall we stand in that great day,
When every thought, and word, and action,
God, the righteous Judge, shall weigh?

Refrain:
How shall we stand in that great day?
How shall we stand in that great day?
Shall we be found before Him wanting?
Or with our sins all washed away?

The work is begun with those who are sleeping,
Soon will the living here be tried,
Out of the books of God''s remembrance,
His decision to abide.

O, how shall we stand that moment of searching,
When all our sins those books reveal?
When from that court, each case decided,
Shall be granted no appeal?'),
(417, 'O solemn thought and can it be
The hour o judgment now is come
Which soon must fix our destiny,
And seal the sinner''s fearful down?
Yes, it is so; the judgment hour
Is swiftly hastening to its close;
Then will the Judge, in mighty power,
Descend in vengeance on His foes.

He who came down to earth to die
An offering for the sins of men,
And then ascended upon on high,
And will e''er long return again,
Is standing now before the ark,
And mercy seat and cherubim,
To plead His blood for saints, and make
The last remembrance of their sin.

The solemn moment is at hand
When we who have His name confessed,
Each in his lot must singly stand
And pass the final, searching test.
Jesus! we hope in Thee alone;
In mercy now upon us look,
Confess our names before the throne,
And blot our sins fromout Thy book.

O blessed Savior! may we feel
The full importance of this hour.
Inspire our hearts with holy zeal,
And aid us by Thy Spirit''s power,
That we may in Thy strength be strong,
And brave the conflict valiantly;
Then, on Mount Zion, join the song,
And swell the notes of victory.'),
(418, 'Day of judgement, day of wonders!
Hark the trumpet''s awful sound,
Louder than a thousand thunders,
Shakes the vast creation round!
How the summons
Will the sinner''s heart confound!

See the Lord in the glory nearing,
Clothed in majesty divine,
You who long for His appearing,
Then shall say, "This God is mine!"
Gracious Savior, Gracious Savior,
Own me in that day as Thine.

At His call the dead awaken,
Rise to life form earth and sea!
All the powers of nature shaken
By His looks prepare to flee.
Careless sinner, Careless sinner,
What will then become of thee?

But to those who have confessed
Loved and served the Lord below,
He will say, "Come near, ye blessed,
See the kingdom I bestow;
You forever, You forever
Shall my love and glory know."'),
(419, 'Soon shall the trump of God
Give out the welcome sound,
That shakes death''s silent chamber walls,
And breaks the turf sealed ground.

You dwellers in the dust,
Awake, come forth, and sing;
Sharp has your frost of winter been,
But bright shall be your spring.

''Twas sown in weakness here;
''Twill then be raised in power;
That which was sown in earthly seed
Shall rise a heav''nly flower.'),
(420, 'Jerusalem, my happy home,
O how I long for thee!
When will my sorrows have an end,
The joys when shall I see?

The walls are all of precious stone,
Most glorious to behold;
Thy gates are richly set with pearl,
Thy streets are paved with gold.

Thy garden and thy pleasant walks
My study long have been;
Such dazzling views by human sight
Have never yet been seen.

Lord, help us by Thy mighty grace,
To keep in view the prize,
Till Thou dost come to take us home
To that blessed paradise.')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(421, 'For all the saints
who from their labors rest,
Who thee by faith
before the world confessed.
Thy name, O Jesus,
be forever blest.
Alleluia!
Alleluia!

Thou wast their Rock,
their Fortress and their Might;
Thou, Lord, their captain
in the well-fought fight;
Thou, in the darkness drear,
their one true light.
Alleluia!
Alleluia!

O may Thy soldiers,
faithful, true, and bold,
Fight as the saints
who nobly fought of old,
And win with them
the victor''s crown of gold.
Alleluia!
Alleluia!

And when the strife is fierce,
the warfare long,
Steals on the ear
the distant triumph song,
And hearts are brave again,
and arms are strong.
Alleluia!
Alleluia!

From earth''s wide bounds,
from ocean''s farthest coast,
Thro'' gates of pearl
streams in the countless host,
Singing to Father,
Son, and Holy Ghost,
Alleluia!
Alleluia!'),
(422, 'Come, we that love the Lord,
And let our joys be known;
Join in a song with sweet accord,
Join in a song with sweet accord,
And thus surround the throne,
And thus surround the throne.

Refrain:
We''re marching to Zion,
Beautiful, beautiful Zion;
We''re marching upward to Zion,
The beautiful city of God.

Let those refuse to sing
Who never knew our God;
But children of the heav''nly King,
But children of the heav''nly King
May speak their joys abroad,
May speak their joys abroad.

The hill of Zion yields
A thousand sacred sweets
Before we reach the heav''nly fields,
Before we reach the heav''nly fields
Or walk the golden streets,
Or walk the golden streets.

Then let our songs abound
And ev''ry tear be dry;
We''re marching thru Immanuel''s ground,
We''re marching thru Immanuel''s ground
To fairer worlds on high,
To fairer worlds on high.'),
(423, 'Glorious things of thee are spoken,
Zion, city of our God;
He whose word cannot be broken
Formed thee for His own abode;
On the Rock of Ages founded,
What can shake thy sure repose?
With salvation''s wall surrounded,
Thou mayest smile at all thy foes.

See the streams of living waters
Springing from eternal love,
Well supply thy sons and daughters,
And all fear and want remove;
Who can faint when such a river
Ever flows their thirst to assuage?
Grace, which, like the Lord, the Giver,
Never fails from age to age.

Round each habitation hovering,
See the cloud and fire appear
For a glory and a covering,
Showing that the Lord is near;
Blest inhabitants of Zion,
Washed in the Redeemer''s blood;
Jesus, whom their souls rely on,
Makes them kings and priests to God.

Savior, if of Zion''s city
I, through grace, a member am,
Let the world deride or pity,
I will glory in Thy name;
Fading is the worldling''s pleasure,
All his boasted pomp and show;
Solid joys and lasting treasure
None but Zion''s children know.'),
(424, 'For thee, O dear country,
Mine eyes their vigils keep;
For very love beholding
Thy holy name, they weep.

O one, O only mansion!
O Paradise of joy!
Where tears are ever banish''d
And smiles have no alloy;

With jasper glow thy burwarks,
Thy streets with emeralds blaze;
The sardius and the topaz
Unite in thee  their rays;

The cross is all thy splendor,
The Crucified thy praise;
His laud and benediction
Thy ransom''d saints shall raise;

O sweet and blessed country,
The home of God''s elect!
O sweet and blessed country
That eager hearts expect!'),
(425, 'There is singing up in heaven
such as we have never known,
Where the angels sing the praises
of the Lamb upon the throne;
Their sweet harps are ever tuneful
and their voices are always clear,
O that we might be more like them
while we serve the Master here!

Refrain:
Holy, holy, is what the angels sing,
And I expect to help them make
the courts of heaven ring;
But when I sing redemption''s story,
they will fold their wings,
For angels never felt the joys
that our salvation brings.

But I hear another anthem,
blending voices clear and strong,
"Unto Him who hath redeemed us
and hath bought us," is the song;
We have come thro'' tribulations
to this land so fair and bright,
In the fountain freely flowing
He hath made our garments white.

Then the angels stand and listen,
for they cannot join that song,
Like the sound of many waters,
by that happy, blood-washed throng;
For they sing about great trials,
battles fought and vict''ries won,
And they praised the great Redeemer,
who hath said to them, "Well done."

So, although I''m not an angel,
yet I know that over there
I will join  a blessed chorus
that the angels cannot share;
I will sing about my Savior,
who upon dark Calvary
Freely pardoned my transgressions,
died to set the sinner free.'),
(426, 'I shall see the King where the angels sing,
I shall see the King some day, in the better land,
On that golden strand,
And with Him shall ever stay.

Refrain:
In His glory, I shall see the King,
And forever endless praises sing;
''Twas on Calvary Jesus died for me;
I shall see the King someday.

In the land of song, in the glory throng,
Where there never comes a night,
With my Lord once slain I shall ever reign
In the glory land of light.

I shall see the King, all my tributes bring,
And shall look upon His face;
Then my song shall be how He ransomed me
And has kept me by His grace.'),
(427, 'In the land of fadeless day
Lies "the city four-square;"
It shall never pass away,
And there is "no night there."

Refrain:
God shall "wipe away all tears;"
There''s no death, no pain, nor fears;
And they count not time by years,
For there is "no night there."

All the gates of pearl are made,
In "the city four-square;"
All the streets with gold are laid,
And there is "no night there."

And the gates shall never close
To "the city four-square;"
There life''s crystal river flows,
And there is "no night there."

There they need no sunshine bright,
In "that city four-square;"
For the Lamb is all the light,
And there is "no night there."'),
(428, 'There''s a land that is fairer than day,
And by faith we can see it afar;
For the Father waits over the way
To prepare us a dwelling place there.

Refrain:
In the sweet in the sweet
By and by by and by,
We shall meet on that beautiful shore;
In the sweet in the sweet
By and by by and by
We shall meet on that beautiful shore.

We shall sing on that beautiful shore
The melodious songs of the blest,
And our spirits shall sorrow no more
Not a sigh for the blessing of rest.

To our bountiful father above
We will offer our tribute of praise;
For the glorious gift of His love
And the blessings that hallow our days.'),
(429, 'Jerusalem the golden,
With milk and honey blest,
Beneath thy contemplation
Sink heart and voice oppressed.
I know not, O I know not
What holy joys are there;
What radiancy of glory,
What bliss beyond compare.

They stand, those hall of Zion,
All jubilant with song,
And bright with many an angel,
And all the martyr throng.
The Prince is ever in them,
The daylight is serene;
The pastures of the blessed
Are deck in glorious sheen.

There is the throne of David,
And there, from care released,
The shout of them that triumph,
The song of them that feast;
And they who, with their Leader,
Have conquered in the fight,
Forever and forever
Are clad in robes of white.

O sweet and blessed country,
The home of God''s elect!
O sweet and blessed country,
That eager hearts expect!
Jesus, in mercy bring us
To  that dear land of rest;
Who art, with God the Father,
And Spirit, ever blest.'),
(430, 'O there''ll be joy when the work is done,
Joy when the reapers gather home,
Bringing the sheaves at set of sun
To the New Jerusalem.

Refrain:
Joy, joy, joy, there''ll be joy by and by,
Joy, joy, joy, where the joys never die;
Joy, joy, joy, for the day draweth nigh
When the workers gather home.

Sweet are the songs that we hope to sing,
Grateful the thanks our hearts shall bring,
Praising forever Christ our King
In the New Jerusalem.

Pure are the joys that await us there,
Many the golden mansions fair;
Jesus Himself doth them prepare,
In the New Jerusalem.'),
(431, 'Come let us sing of homeland,
Down by the crystal sea;
Wonderful land where Jesus
Buildeth a mansion for me.

Refrain:
Over yonder, down by the crystal sea,
Over yonder, there''s where I long to be,
No more sorrow, toil, grief, nor care,
In the homeland bright and fair,
Over, over there.

Water of life there floweth,
Fruit in abundant store;
Citizens of that country
Hunger and thirst never more.

Come go with me to homeland,
Jesus invites you there;
Help spread the invitation,
Tell it to men everywhere.'),
(432, 'Shall we gather at the river,
where bright angel feet have trod,
with its crystal tide forever
flowing by the throne of God?

Refrain:
Yes, we''ll gather at the river,
the beautiful, the beautiful river;
gather with the saints at the river
that flows by the throne of God.

On the margin of the river,
washing up its silver spray,
we will walk and worship ever,
all the happy golden day.

Ere we reach the shining river,
lay we every burden down;
grace our spirits will deliver,
and provide a robe and crown.

Soon we''ll reach the shining river,
soon our pilgrimage will cease;
soon our happy hearts will quiver
with the melody of peace.'),
(433, 'Ten thousand times ten thousand,
In sparkling raiment bright,
The armies of the ransomed saints
Throng up the steeps of light.
''Tis finished, all is finished,
Their fight with death and sin.
Fling open wide the golden gates,
And let the victors in.

What rush of hallelujahs
Fills all the earth and sky!
The ringing of a thousand harps
Proclaims the triumph high.
O day for which creation
And all its tribes were made!
O joy, for all its former woes
A thousandfold repaid!

O then what raptured greetings
On Canaan''s happy shore!
What knitting severed friendship where
Death partings are no more!
Then eyes with joy shall sparkle,
That brimmed with tears of late;
Orphans no longer fatherless,
Nor widows desolate.

Bring near Thy great salvation,
Thou Lamb for sinners slain,
Fill up the roll of Thine elect,
Then take Thy power and reign!
Appear, Desire of nations,
Thine exiles long for home;
Show in the heavens Thy promised sign;
Thou Prince and Savior come!'),
(434, 'We speak of the realms of the blest,
That country so bright and so fair,
And oft are its glories confessed-
But what must it be to be there!
We speak of its pathway of gold-
Its walls decked with jewels so rare,
Its wonders and pleasures untold-
But what must it be to be there!

We speak of its freedom of sin,
From sorrow, temptation and care,
From trials without and within---
But what must it be to be there!
We  speak of its service of love,
Of the robes which glorified wear,
Of the church of the First Born above-
But what must it  be to be there!

Our mourning is all at an end,
When, raised by the life-giving word,
We see the new city descend,
Adorned as a bride for her Lord;
The city so holy and clean,
No sorrow can breathe in the air;
No gloom of affliction or sin,
No shadow of evil, is there.

Do Thou, midst temptation and woe,
For heaven my spirit prepare;
And shortly I also so shall know
And feel what it is to be there.
Then o''er the bright fields we shall roam,
In glory celestial and fair,
With saints and with angels at home,
And Jesus Himself will be there.'),
(435, 'When all my labors and trails are o''er,
And I am  safe on that beautiful shore,
Just to be near the Lord I adore,
Will through the ages be glory for me.

Refrain:
O that will be
Glory for me, Glory for me,
Glory for me; When by His grace
I shall look on His face,
That will be glory, be glory for me.

When, by the gift of His infinite grace,
I am accorded in heaven a place,
Just to be there and to look on His face,
Will through the ages be glory for me.

Friends will be there I have loved long ago;
Joy like a river around me will flow,
Yet, just a smile form my Savior, I know,
Will through the ages be glory for me.'),
(436, 'The homeland! O the homeland!
The land of the free born!
There''s no night in the homeland,
But aye the fadeless morn;
I''m sighing for homeland,
My heart is aching here;
There is no pain in the homeland
To which I''m drawing near;
There is no pain in the homeland
To which I''m drawing near.

My Lord is in the homeland,
With angels bright and fair;
There''s no sin in the homeland,
And no temptation there;
The music of the homeland
Is ringing in my ears;
And when I think of the homeland
My eyes are filled with tears;
And when I think of the homeland
My  ears are filled with tears.

The dwellers in the homeland
Are beckoning me to come,
Where neither death nor sorrow
Invades their holy name;
O dear, dear native country!
O rest  and  peace above!
Christ bring us all to the homeland
Of Thy redeeming love;
Christ bring us all to the homeland
Of  Thy redeeming love'),
(437, 'My heav''nly home is bright and fair,
Nor pain nor death can enter there;
It''s glitt''ring tow''rs the sun outshine,
That heav''nly mansion shall me mine.

Refrain:
I''m going home, I''m going home,
I''m going home to die no more;
To die no more; to die no more-
I''m going home to die no more.

My Father''s house is built on high,
Far, far above the starry  sky;
When from this earthly prison free,
That heav''nly mansion mine shall be.

Let others seek a home below,
Which flames devour or waves oe''r flow;
Be mine a happier lot to own
A heav''nly mansion near the throne.'),
(438, 'You will see your Lord acoming,
You will see your Lord acoming,
You will see your Lord acoming
In a few more days.

Refrain:
Hear the band of music,
Hear the band of music,
Hear the band of music
which is sounding thro'' the air.

Gabriel sounds his mighty trumpet,
Gabriel sounds his mighty trumpet,
Gabriel sounds his mighty trumpet
In a few more days.

You will see the saints arising,
You will see the saints arising,
You will see the saints arising
In a few more days.

Angels bear them to the Savior,
Angels bear them to the Savior,
Angels bear them to the Savior
In a few more days.

Then we''ll shout, our suff''ring over,
Then we''ll shout, our suff''ring over,
Then we''ll shout, our suff''ring over
In a few more days.</div>'),
(439, 'How far from? I asked, as on
I bent my steps-the watchman spake:
"the long, dark night is almost gone,
The morning soon  will break.
Then weep no more, but speed thy flight,
With Hope''s bright star guiding ray,
Till thou shalt  reach the realms of light,
In everlasting days."

I asked the warrior on the field;
This was his soul-inspiring song:
"With courage, bold, the sword I''ll wield,
The battle is not long.
Then weep no more, but well endure
The conflict, till thy work is done;
For this we know, the prize is sure,
When victory is won."

I asked again; earth, sea, and sun
Seemed, with one voice, to make reply:
"Time''s wasting sands are nearly run,
Eternity is nigh.
Then weep no more-with warning tones,
Portentous signs are thickening round,
The whole creation, waiting, groans,
To hear the trumpet sound."

Not far from home! O blessed thought!
The traveler''s lonely heart to  cheer;
Which oft a healing balm has brought,
And dried the mourner''s tear.
Then weep no more, since we shall meet
Where weary footsteps never roam-
Our trails past, our joys complete,
Safe in our Father''s home.'),
(440, 'How cheering is the Christian''s hope,
While toiling here below!
It bouys us up while this passing through
This wilderness of woe,

It bouys us up while this passing through
This wilderness of woe,
It bouys us up while passing through
This wilderness of woe.

It points us to a land of rest,
Where saints with Christ will reign;
Where we shall meet the loved of earth,
And never part again.

Fly, lingering moments, fly, O, fly,
Dear Savior, quickly come!
We long to see Thee as Thou art,
And reach that blissful home.'),
(441, 'I saw one weary, sad, and torn,
With eager steps press on the way,
Who long the hallowed cross had born,
Still looking for the promised day;
While many a line of grief and care,
Upon his brow was furrowed there;
I asked what buoyed his spirits up,
"O this"  said he-"the blessed hope."

And one I saw, with sword and shield,
Who boldly braved the world''s cold frown,
And fought, unyielding, on the field,
To win an everlasting crown.
Though worn with toil, oppressed by foes,
No murmur from his heart arose;
I asked what buoyed his spirits up,
"O this!" said he-"the blessed hope."

And there was  one who left behind
The cherished friends of early years,
And honor, pleasure, wealth re-signed,
To tread the path bedewed with tears.
Through trials deep and conflict sore,
Yet still a smile of joy he wore;
O! what can bouy the spirit up?
''Tis this alone-the blessed hope.

While pilgrims here we journey on
In this dark vale of sin and gloom,
Through tribulation, hate, and scorn,
Or through the portals of the tomb,
Till our returning King shall come
To tkae His exile captives home,
O! what can bouy the spirits up?
''Tis this alone-- the blessed hope.'),
(442, 'How sweet  are the tidings that greet the pilgrim''s ear,
As he wanders in exile from home!
Soon, soon will the Savior in glory appear,
And soon will the kingdom come.

Refrain:
He''s coming, coming, coming soon I know,
Coming back to this earth again;
And the weary pilgrims will to glory go,
When the Savior comes to reign.

The mossy  old graves where the pilgrims sleep
Shall be open as wide as before,
And the millions that sleep in the mighty deep
Shall live on this earth once more.

There we''ll meet ne''er to part in our happy
Eden home, Sweet songs of redemption we''ll sing;
From the north, from the south, all the ransomed shall come,
And worship our heavenly King.

Hallelujah, Amen! Hallelujah again!
Soon, if faithful, we all shall be there;
O, be watchful, be hopeful, be joyful till then,
And a crown of bright glory we''ll wear.'),
(443, 'There''ll be no night in heaven,
In that blest world above;
No anxious toil, no weary hours;
For labor there is love.

Refrain:
There''ll be no sorrow there,
There''ll be no sorrow there;
In heaven above, where all is love,
There''ll be no sorrow there.

There''ll be no grief in heaven;
For life is one glad day,
And tears are those of former things
Which all have passed away.

There''ll be no sin in heaven;
Behold that blessed throng,
All holy in there spotless robes,
All holy in their  song.'),
(444, 'I''m a pilgrim, and I''m a stranger;
I can tarry, I can tarry but a night;
Do not detain me, for I am going
To where the fountains are ever flowing.

Refrain:
I''m a pilgrim, and I''m a stranger;
I can tarry, I can tarry but a night.

There the glory is ever shining!
O, my longing heart, my longing heart is there;
Here in this country so dark and dreary,
I long have wandered forlorn and weary.

There''s the city to which I journey;
My Redeemer, my Redeemer is its light!
There is no sorrow, nor any sighing,
Nor any tears there, or any dying.'),
(445, 'I''m but a stranger here,
Heav''n is my home;
Earth is a desert drear,
Heav''n is my home.
Danger and sorrow stand
Round me on every hand;
Heav''n is my fatherland,
Heav''n is my home.

What though the tempest rage,
Heav''n is my home;
Short is my pilgrimage,
Heav''n is my home;
And time''s wild wintry blast
Soon shall be over past;
I shall reach home at last,
Heav''n is my home.

There at my Savior''s side
Heav''n is my home;
I shall be glorified,
Heav''n is my home;
There are the good and blest,
Those I love most and best;
And there I, too, shall rest,
Heav''n is my home.'),
(446, 'Lo, what a glorious sight appears
To our believing eyes!
The earth and seas are passed away
And the old rolling skies.
And the old rolling skies,
And the old rolling skies;
The earth and seas are passed away,
And the old rolling skies.

Refrain:
O that will be  joyful, joyful, joyful!
O that will be joyful
When we meet to part no more!
When we meet to part no more
On Canaan''s happy shore;
''Tis there we''ll meet at Jesus'' feet,
When we meet to part no more!

Attending angels shout for joy
And the bright armies sing-
Mortals! Behold the sacred seat
Of your descending King.
Of your descending King,
Of your descending King;
Mortals! Behold the sacred seat
Of your descending King.

His own soft hand shall wipe the tears
From every weeping eye;
And pains, and groans, and griefs, and fears,
And death itself shall die!
And death itself shall die,
And death itself shall die;
And pains, and groans, and griefs, and fears,
And death itself shall die.

How long, dear Savior! Oh, how long
Shall this bright hour delay?
Fly swifter round, ye wheels of time!
And bring the welcome day.
And bring the welcome day,
And bring the welcome day;
Fly swifter round, ye wheels of  time!
And bring  the welcome day.'),
(447, 'Long upon the mountains weary,
Have the  scattered flocks been torn;
Dark the dessert paths, and dreary;
Grievous trials have they borne.
Now the gathering call is sounding,
Solemn in its warning voice;
Union, faith, and love, abounding,
Bid the little flock rejoice.

Now the light of truth they''re seeking,
In its onward track pursue;
All the ten commandments keeping,
They are holy, just, and true.
On the words of lire they''re feeding,
Precious to their taste so sweet;
All their Master''s percepts heeding,
Bowing humbly to His feet.

In that light of light and beauty,
In that golden city fair,
Soon its pearly gates they''ll enter,
And of all its glories share.
There, divine the soul''s expansions;
Free from sin, and death, and pain;
Tear will never dim those mansions
Where the souls immortal reign.

Soon He comes! With clouds descending;
All His saints, entombed arise;
The redeemed, in anthems blending,
Shout their vict''ry thro'' the skies.
O, we long for Thine appearing;
Come, O Savior, quickly come!
Blessed hope! Our spirits cheering,
Take thy ransomed children home.'),
(448, 'O, when shall I see Jesus and reign with Him above,
And shall hear the trumpet sound in that morning?
And from the flowing fountain drink everlasting love,
And shall hear the trumpet sound in that morning.

Refrain:
O, shout, glory! For I shall mount above the skies,
When I hear the trumpet sound in that morning.

Gird on the gospel armor of faith and hope and love,
And you''ll hear the trumpet  sound in that morning.
And when the combat''s ended He''ll carry you above,
And you''ll hear the trumpet sound in that morning.

Our ears shall hear with transport the host of heaven sing,
And shall hear the trumpet sound in that morning.
Our tongues shall chant the glories of our immortal King.
And shall hear the trumpet sound in that morning,'),
(449, 'There is a land of pure delight,
Where bliss eternal reigns,
Infinite day excludes the night
And pleasures banish pain.

Refrain:
We''re trav''ling to  Immanuel''s land,
We soon shall hear the trumpet sound,
And soon we shall with Jesus reign,
And never, never part again.
What! Never part again? No, never part again,
What! Never part again? No, never part again,
And soon we shall with Jesus reign,
And never, never part again.

There everlasting spring abides,
And never with''ring flowers,
And but a little space divides
This heav''nly land from ours.

Could we but stand where Moses stood,
And view the landscape o''er,
Not all  this world''s pretended good
Could ever charm us more.'),
(450, 'Beautiful Zion, built above,
Beautiful city that I love,
Beautiful gates of pearly white,
Beautiful temple, God its light.

Beautiful trees forever there,
Beautiful fruit they always bear,
Beautiful rivers gliding by,
Beautiful fountains never dry.

Beautiful crowns on every brow,
Beautiful palms the conquerors show,
Beautiful robes the ransomed wear,
Beautiful all who enter there.'),
(451, 'Together let us sweetly live,
I am  bound for the land of Canaan.
Together love to Jesus give;
I am bound for the land of Canaan.

Refrain:
O Canaan, bright Canaan,
I am bound for the land of Canaan.
O Canaan, it is my happy home,
I am bound for the land of Canaan.

Together let us watch and pray;
I am bound for the land of Canaan.
And wait redemption''s joyous day;
I am bound for the land of Canaan.

Our songs of praise shall fill the skies;
I am bound for the land of  Canaan.
While higher still our joys shall rise;
I am bound for the land of Canaan.

Then come with me, beloved friend;
I am bound for the land of Canaan.
The joys to come shall never end;
I am bound for the land of Canaan.'),
(452, 'What heavenly music steals over the sea!
Entrancing the senses like sweet melody!
''Tis the voice of the angels borne soft on the air;
For me they are singing; their welcome I hear.

On the banks of old Jordan, here gazing I stand,
And earnestly longing, I stretch forth my hand;
Send a convoy of angels, dear Jesus, I pray!
Let me join that sweet music; come, take me away.

Though dark are the waters and rough is the wave,
If Jesus permit, the wild surges I''ll brave;
For that heavenly music hath ravished me so,
I must join in that chorus! I''ll go! let me go!'),
(453, 'We have heard from the bright, the holy, land;
We have heard, and our hearts are glad;
For we were a lonely pilgrim band,
And weary, and worn, and sad.
They tell us the saints have a dwelling there-
No longer are homeless ones;
And we know that the goodly land is fair,
Where life''s pure river runs.

They say green fields are waving there,
That never a blight shall know;
And the deserts wild are blooming fair,
And the roses of Sharon grow.
There are lovely birds in the bowers green,
Their songs are blithe and sweet;
And their warblings, gushing ever new,
The angels'' harpings greet.

We have heard of the palms, the robes, the crowns,
And the silvery band in white;
Of the city fair, with pearly gates,
All radiant with light.
We have heard of the angels there, and saints,
With their harps of gold, how they sing;
Of the mount with the fruitful tree of life,
Of the leaves that healing bring.

The King of that country, He is fair,
He''s the joy and light of the place;
In His beauty we shall behold Him there,
And bask in His smiling face,
We''ll be there, we''ll be there in a little while,
We''ll join the pure and the blest;
We''ll have the palm, the robe, the crown,
And forever be at rest.'),
(454, 'Don''t you see my Jesus coming,
See Him come in yonder cloud?
With ten thousand angels round Him,
How they do my Jesus crowd!

Refrain:
I am bound for the kingdom,
Will you go to glory with me?
Hallelujah! O praise ye the Lord!

Don''t you see the saints ascending,
Hear them shouting thro'' the air.
Jesus smiling, trumpets sounding,
Now His glory they shall share.'),
(455, 'Immortal Love, forever full,
Forever flowing free,
Forever shared, forever whole,
A never ebbing sea!

We nay not climb the heavenly steeps
To bring the Lord Christ down;
In vain we search the lowest deeps,
For him no depths can drown.

But warm, so tender, even yet
A present help is He;
And  faith has still its Olivet,
And love its Galilee.

The healing of His seamless dress
Is by our beds of pain;
We touch Him in life''s throng and press,
And we are whole again.

Through Him the first fond prayers are said,
Our lips of childhood frame;
The last low whispers of our dead
Are burdened with His name.

O Lord and Master of us all:
Whate''er our names or sign,
We own Thy sway, we hear Thy call,
We test our lives by Thine!'),
(456, 'I have a Friend so precious,
So very dear to me,
He loves me with such tender love,
He loves so faithfully;
I could not live apart form Him,
I love to feel Him nigh,
And so we dwell together,
My Lord and I.

Sometimes I''m faint and weary,
He knows that I am weak,
And as He bids me lean on Him,
His help I gladly seek;
He leads me in the paths of light,
Beneath a sunny sky,
And so we walk together,
My Lord and I.

I tell Him all my sorrows,
I tell Him all my joys,
I tell Him all that pleases me,
I tell Him what annoys;
He tells me what I ought to do,
He tells me how to try,
And so we talk together,
My Lord and I.

He knows that I am longing
Some weary soul to win,
And so He bids me go and speak
The loving word for Him;
He bids me tell His wondrous love,
And why He came to die,
And so we work together,
My Lord and I.'),
(457, 'I love to tell the story
of unseen things above,
of Jesus and his glory,
of Jesus and his love.
I love to tell the story,
because I know ''tis true;
it satisfies my longings
as nothing else can do.

Refrain:
I love to tell the story,
''twill be my theme in glory,
to tell the old, old story
of Jesus and his love.

I love to tell the story;
more wonderful it seems
than all the golden fancies
of all our golden dreams.
I love to tell the story,
it did so much for me;
and that is just the reason
I tell it now to thee.

I love to tell the story;
''tis pleasant to repeat
what seems, each time I tell it,
more wonderfully sweet.
I love to tell the story,
for some have never heard
the message of salvation
from God''s own holy Word.

I love to tell the story,
for those who know it best
seem hungering and thirsting
to hear it like the rest.
And when, in scenes of glory,
I sing the new, new song,
''twill be the old, old story
that I have loved so long.'),
(458, 'More love to thee, O Christ, more love to thee!
Hear thou the prayer I make on bended knee.
This is my earnest plea: More love, O Christ, to thee;
more love to thee, more love to thee!

Once earthly joy I craved, sought peace and rest;
now thee alone I seek, give what is best.
This all my prayer shall be: More love, O Christ, to thee;
more love to thee, more love to thee!

Let sorrow do its work, come grief and pain;
sweet are thy messengers, sweet their refrain,
when they can sing with me: More love, O Christ, to thee;
more love to thee, more love to thee!

Then shall my latest breath whisper thy praise;
this be the parting cry my heart shall raise;
this still its prayer shall be: More love, O Christ, to thee;
more love to thee, more love to thee!'),
(459, 'As the bridegroom to his chosen,
As the king to his realm,
As the keep unto the castle,
As the pilot to the helm,
So, Lord, art Thou to me.

As the fountain in the garden,
As the candle in the dark,
As the treasure in the coffer,
As the manna in the ark,
So, Lord, art Thou to me.

As the ruby in the setting,
As the honey in the comb,
As the light within the lantern,
As the father in the home,
So, Lord, art Thou to me.

As the sunshine in the heavens,
As the image in the glass,
As the fruits up in the fig tree,
As the dew upon the grass,
So, Lord, art Thou to me.'),
(460, 'As water to the thirsty,
As beauty to the eyes,
As strength that follows weakness,
As truth instead of lies;
As songtime and springtime and summertime to be,
So is my Lord, my living Lord,
So is my Lord to me.

Like calm in place of clamor
Like peace that follows pain,
Like meeting after parting,
Like sunshine after rain;
Like moonlight and starlight and sunlight on the sea,
So is my Lord, my living Lord,
So is my Lord to me.

As sleep that follows fever,
As gold instead of grey,
As freedom after bondage,
As sunrise to the day;
As home to the trav''ler and all he longs to see,
So is my Lord, my Living Lord to me.'),
(461, 'Be still, my soul: the Lord is on thy side;
Bear patiently the cross of grief or pain;
Leave to thy God to order and provide;
In every change He faithful will remain.
Be still, my soul: thy best, thy heavenly friend
Through thorny ways leads to a joyful end.

Be still, My soul: thy God doth undertake
To guide the future as He has the past.
Thy hope, thy confidence let nothing shake;
All now mysterious shall be bright at last.
Be still, my soul: when waves and winds still know
His voice who ruled them while He dwelth below.

Be still, my soul: the hour is hastening on
When we shall be forever with the Lord,
When disappointment, grief, and fear are gone,
Sorrow forgot, love''s purest joys restored.
Be still, my soul: when change and tears are past,
All safe and  blessed we shall meet at last.'),
(462, 'Blessed assurance, Jesus is mine!
O what a foretaste of glory divine!
Heir of salvation, purchase of God,
born of his Spirit, washed in his blood.

Refrain:
This is my story, this is my song,
praising my Savior all the day long;
this is my story, this is my song,
praising my Savior all the day long.

Perfect submission, perfect delight,
visions of rapture now burst on my sight;
angels descending bring from above
echoes of mercy, whispers of love.

Perfect submission, all is at rest;
I in my Savior am happy and blest,
watching and waiting, looking above,
filled with his goodness, lost in his love.'),
(463, 'Peace, perfect peace, in this dark world of sin?
The blood of Jesus whispers peace within.

Peace, perfect peace, by thronging duties pressed?
To do the will of Jesus: this is rest.

Peace, perfect peace, with loved ones far away?
In Jesus'' keeping we are safe, and they.

Peace, perfect peace, our future all unknown?
Jesus we know, and He is on the throne.'),
(464, 'When I can read my title clear
To mansions in the skies
I''ll bid farewell to every fear,
And wipe my weeping eyes;
And wipe my weeping eyes,
And wipe my weeping eyes,
I''ll bid farewell to every fear,
And wipe my weeping eyes.

Should earth against my soul engage,
And fiery darts be hurled,
Then I can smile at Satan''s rage,
And face a frowning world;
And face a frowning world,
And face a frowning world,
Then I can smile at Satan''s rage,
And face a frowning world.

Let cares like a wild deluge come,
And storms or sorrow fall!
May I but safely reach my home,
May God, my heav''n, my all;
My God. my heav''n, my all,
My God, my heav''n, my all,
May I but safely reach my home,
My God, my heav''n, my all.'),
(465, 'I heard the voice of Jesus say,
"Come unto Me and rest;
Lay down, thou weary one, lay down
Thy head upon My breast."
I came to Jesus as I was,
Weary and worn and sad;
I found in Him a resting place,
And He has made me glad.

I heard the voice of Jesus say,
"Behold, I freely give
The living water; thirsty one,
Stoop down and drink and live."
I came to Jesus, and I drank
Of that life giving stream;
My thirst was quench''d, my soul revived,
And now I live in Him.

I heard the voice of Jesus say,
"I am this dark world''s light;
Look unto Me, thy morn shall rise,
And all thy day be bright."
I looked to Jesus, and I found
In Him my star, my sun;
And in that light of  life I''ll walk,
Till trav''ling  days are done.'),
(466, 'Far away in the depths of my spirit tonight,
Rolls a melody sweeter than psalm;
In celestial like strains it unceasingly falls
O''er my soul like an infinite calm.

Refrain:
Peace! Peace! wonderful peace,
Coming down from the Father above;
Sweep over my spirit forever, I pray,
In fathomless billows of love.

What a treasure I have in this wonderful peace,
Buried deep in my inner most soul,
So secure that no power can mine it away,
While the years of eternity roll!

I believe when I rise to that city of peace,
Where the Author of peace I shall see,
That one strain of the song which the ransomed will sing,
In that heavenly kingdom will be-

Weary soul, without gladness or comfort or rest,
Passing down the rough pathway of time!
Make the Savior your friend ere the shadows grow dark;
O accept of this peace so sublime.'),
(467, 'Life is great! So sing about it,
As we can and as we should-
Shop and buses, towns and people,
Village, farmland, field and wood,
Life is great and life is given;
Life is lovely, free and good.

Life is great!- what ever happens,
Snow or sunshine, joy or pain,
Hardship, grief or disillusion,
Suffering that I can''t explain-
Life is great if someone loves me,
Holds my hand and calls my name.

Love is great!- the love of lovers,
Whispered words and longing eyes;
Love that gazes at the cradle
Where a child of loving lies;
Love that lasts when youth has faded,
Bends with age, but never dies.

Love is giving and receiving-
Boy and girl, or friend with friend;
Love is bearing and forgiving
All the hurts that hate can send;
Love''s the greatest way of living,
Hoping, trusting to the end.

God is great! in  Christ He loved us,
As we should, but never can-
Love that suffered, hoped and trusted
When disciples turned and ran,
Love that broke through death forever.
Praise that loving, living Man!'),
(468, 'My Father is rich in houses and lands,
He holdeth the wealth of the world in His hands!
Of rubies and diamonds, of silver and gold,
His coffers are full, He has riches untold.

Refrain:
I''m a child of the King,
A child of the King:
With Jesus my Savior,
I''m a child of the King.

My Father''s own Son, the Savior of men,
Once wandered on earth as the poorest of them;
But now He is pleading our pardon on high,
That we may be His when He comes by and by.

I once was an outcast stranger on earth,
A sinner by choice, an alien by birth,
But I''ve been adopted, my name''s written down,
An heir to a mansion, a robe and a crown.

A tent or a cottage, why should I care?
They''re building a palace for me over there;
Though exiled from home, yet still may I sing:
All glory to God, I''m a child of the King.'),
(469, 'What a fellowship, what a joy divine,
leaning on the everlasting arms;
what a blessedness, what a peace is mine,
leaning on the everlasting arms.

Refrain:
Leaning, leaning,
safe and secure from all alarms;
leaning, leaning,
leaning on the everlasting arms.

O how sweet to walk in this pilgrim way,
leaning on the everlasting arms;
O how bright the path grows from day to day,
leaning on the everlasting arms.

What have I to dread, what have I to fear,
leaning on the everlasting arms?
I have blessed peace with my Lord so near,
leaning on the everlasting arms.'),
(470, 'There''s sunshine in my soul today,
More glorious and bright
Than glows in any earthly sky,
For Jesus is my light.

Refrain:
O there''s sunshine, blessed sunshine,
When the peaceful, happy moments roll
When Jesus shows His smiling face
There is sunshine in the soul.

There''s music in my soul today,
A carol to my King,
And Jesus, listening, can hear
The songs I cannot sing.

There''s springtime in my soul today,
For when the Lord is near,
The dove of peace sings in my heart,
The flowers of grace appear.

Theres gladness in my soul today,
And hope, and praise, and love,
For blessings which He gives me now,
For joys "laid up" above.'),
(471, 'Dona nobis pacem, pacem; Dona nobis pacem.
Dona nobis pacem; Dona nobis pacem.
Dona nobis pacem; Dona nobis pacem.

Father grant us, grant us Your peace;
Oh, loving Father, grant us Your peace.
Grant us, grant us peace;
Grant us, grant us, grant Your peace;
Grant us, grant us peace;
Loving Father, grant us Your peace.

Accordenous ta paix, ta paix, Accordenous ta paix.
Accordenous ta paix; Accordenous ta paix.
Accordenous ta paix, Accordenous ta paix.

Padre, danos tupaz, tupaz; Padre, danos, danos tupaz
Padre, danos, tupaz. Padre, danos, danos tupaz
Padre, danos tupaz. Padre, danos, danos tupaz.'),
(472, 'Sometimes I hear strange music,
Like none e''er heard before,
Come floating softly earthward
As thro'' heav''n''s open door:
It seems like angel voices,
In strains of and love,
That swell the mighty chorus
Around the throne above.

Refrain:
O sweet, celestial music,
Heard from a land afar-
The song of Heav''n and Homeland,
Thro'' doors God leaves ajar!

Now soft, and low, and restful,
It floods my soul with peace,
As if God''s benediction
Bade all earth''s troubles cease.
Then grander than the voices,
Of wind, and wave, and sea-
It fills the dome of heaven
With glorious harmony.

This music haunts me ever,
Like something heard in dreams-
It seems to catch the cadence
Of heav''nly winds and streams,
My heart is filled with rapture,
To think, some day to come,
I''ll sing it with the angels-
The song of heav''n and home.'),
(473, 'Nearer, my God, to thee, nearer to thee!
E''en though it be a cross that raiseth me,
still all my song shall be,
nearer, my God, to thee;
nearer, my God, to thee, nearer to thee!

Though like the wanderer, the sun gone down,
darkness be over me, my rest a stone;
yet in my dreams I''d be
nearer, my God, to thee;
nearer, my God, to thee, nearer to thee!

There let the way appear, steps unto heaven;
all that thou sendest me, in mercy given;
angels to beckon me
nearer, my God, to thee;
nearer, my God, to thee, nearer to thee!

Then, with my waking thoughts bright with thy praise,
out of my stony griefs Bethel I''ll raise;
so by my woes to be
nearer, my God, to thee;
nearer, my God, to thee, nearer to thee!

Or if, on joyful wing cleaving the sky,
sun, moon, and stars forgot, upward I fly,
still all my song shall be,
nearer, my God, to thee;
nearer, my God, to thee, nearer to thee!'),
(474, 'Take the Name of Jesus with you,
Child of sorrow and of woe,
It will joy and comfort give you;
Take it then, where''er you go.

Refrain:
Precious Name, O how sweet!
Hope of earth and joy of Heav''n.
Precious Name, O how sweet!
Hope of earth and joy of Heav''n.

Take the Name of Jesus ever,
As a shield from every snare;
If temptations round you gather,
Breathe that holy Name in prayer.

O the precious Name of Jesus!
How it thrills our souls with joy,
When His loving arms receive us,
And His songs our tongues employ!

At the Name of Jesus bowing,
Falling prostrate at His feet,
King of kings in heav''n we''ll crown Him,
When our journey is complete.'),
(475, 'There is a balm in Gilead
To make the wounded whole;
There is a balm in Gilead
To heal the sin-sick soul.

Sometimes I feel discouraged,
And think my work''s in vain,
But then the Holy Spirit
Revives my soul again.

If you can not preach like Peter,
If you can not pray like Paul,
You can tell the love of Jesus,
And say He died for all.'),
(476, 'Days are filled with sorrow and care,
Hearts are lonely and drear;
Burdens are lifted at Calvary,
Jesus is very near.

Refrain:
Burdens are lifted at Calvary,
Calvary, Calvary,
Burdens are lifted at Calvary,
Jesus is very near.

Cast your care on Jesus today,
Leave your worry and fear;
Burdens are lifted at Calvary,
Jesus is very near.

Troubled soul, the Saviour can see,
Ev''ry heartache and tear;
Burdens are lifted at Calvary
Jesus is very near.'),
(477, 'Come, ye disconsolate, where''er ye languish.
come to the mercy seat, fervently kneel.
Here bring your wounded hearts, here tell your anguish;
earth has no sorrow that heaven cannot heal.

Joy of the desolate, light of the straying,
hope of the penitent, fadeless and pure!
Here speaks the Comforter, tenderly saying,
"Earth has no sorrow that heaven cannot cure."

Here see the bread of life; waters flowing
forth from the throne of God, pure from above.
Come to the feast of love; come, ever knowing
earth has no sorrow but heaven can remove.'),
(478, 'Sweet hour of prayer! sweet hour of prayer!
that calls me from a world of care,
and bids me at my Father''s throne
make all my wants and wishes known.
In seasons of distress and grief,
my soul has often found relief,
and oft escaped the tempter''s snare
by thy return, sweet hour of prayer!

Sweet hour of prayer! sweet hour of prayer!
thy wings shall my petition bear
to him whose truth and faithfulness
engage the waiting soul to bless.
And since he bids me seek his face,
believe his word, and trust his grace,
I''ll cast on him my every care,
and wait for thee, sweet hour of prayer!

Sweet hour of prayer! sweet hour of prayer!
May I thy consolation share
Till from Mount Pisgah''s lofty height
I view my home and take my flight.
In my immortal flesh I''ll rise
To size the everlasting prize.
And shout while passing through the air,
"Farewell, farewell, sweet hour of prayer!"'),
(479, 'Be silent, be silent,
A whisper is heard;
Be silent, and listen,
Oh treasure each word.

Refrain:
Tread softly, tread softly, The Master is here;
Tread softly, tread softly, He bids us draw near.

Be silent, be silent,
For holy this place,
This altar that echoes
The message of grace.

Be silent, be silent,
Breathe humbly our prayer;
A foretaste of Eden
This moment we share.

Be silent, be silent,
His mercy record;
Be silent, be silent,
And wait on the Lord.'),
(480, 'Dear Lord and Father of mankind,
forgive our foolish ways;
reclothe us in our rightful mind,
in purer lives thy service find,
in deeper reverence, praise.

In simple trust like theirs who heard,
beside the Syrian sea,
the gracious calling of the Lord,
let us, like them, without a word,
rise up and follow thee.

O sabbath rest by Galilee,
O calm of hills above,
where Jesus knelt to share with thee
the silence of eternity,
interpreted by love!

Drop thy still dews of quietness,
till all our strivings cease;
take from our souls the strain and stress,
and let our ordered lives confess
the beauty of thy peace.

Breathe through the heats of our desire
thy coolness and thy balm;
let sense be dumb, let flesh retire;
speak through the earthquake, wind, and fire,
O still, small voice of calm.'),
(481, 'Dear Lord and Father of mankind,
forgive our foolish ways;
reclothe us in our rightful mind,
in purer lives thy service find,
in deeper reverence, praise.

In simple trust like theirs who heard,
beside the Syrian sea,
the gracious calling of the Lord,
let us, like them, without a word,
rise up and follow thee.

O sabbath rest by Galilee,
O calm of hills above,
where Jesus knelt to share with thee
the silence of eternity,
interpreted by love!

Drop thy still dews of quietness,
till all our strivings cease;
take from our souls the strain and stress,
and let our ordered lives confess
the beauty of thy peace.

Breathe through the heats of our desire
thy coolness and thy balm;
let sense be dumb, let flesh retire;
speak through the earthquake, wind, and fire,
O still, small voice of calm.'),
(482, 'Father, lead me day by day,
Ever in Thine own sweet way;
Teach me to be pure and true;
Show me what I ought to do.

When in danger, make me brave;
Make me know that Thou canst save;
Keep me safe by Thy dear side;
Let me in Thy love abide.

When tempted to do wrong,
Make me steadfast, wise, and strong;
And when all alone I stand,
Shield me with Thy mighty hand.

May I do the good I know,
Be Thy loving child below,
Then at last go home to Thee,
Evermore Thy child to be.'),
(483, 'I need thee every hour, most gracious Lord;
no tender voice like thine can peace afford.

Refrain:
I need thee, O I need thee;
every hour I need thee;
O bless me now, my Savior, I come to thee.

I need thee every hour; stay thou nearby;
temptations lose their power when thou art nigh.

I need thee every hour, in joy or pain;
come quickly and abide, or life is vain.

I need thee every hour; teach me thy will;
and thy rich promises in me fulfill.'),
(484, 'I need Thee precious Jesus, for I am very poor;
A stranger and a pilgrim, I have no earthly store.
I need the love of Jesus to cheer me on my way,
To guide my doubting foot steps, to be my strength and stay.

I need the heart of Jesus to feel each anxious care,
To tell my every trial, and all my sorrows share.
I need the Holy Spirit to teach me what I am,
To show me more of Jesus, to point me to the Lamb.

I need Thee precious Jesus, I hope to see Thee soon,
Encircled with the rainbow, and seated on Thy throne.
There with Thy blood-bought children, my joy shall ever be
To sing Thy ceaseless praises, to gaze, my Lord, on Thee.'),
(485, 'I must tell Jesus all of my trials,
I cannot bear these burdens alone;
In my distress He kindly will help me,
He ever loves and cares for His own.

Refrain:
I must tell Jesus! I must tell Jesus!
I cannot bear my burdens alone;
I must tell Jesus! I must tell Jesus!
Jesus can help me, Jesus alone.

I must tell Jesus all of my troubles,
He is a kind, compassionate Friend;
If I but ask Him He will deliver,
Make of my troubles quickly an end.

Oh, how the world to evil allures me!
Oh, how my heart is tempted to sin!
I must tell Jesus, and He will help me
Over the world the vict''ry to win.'),
(486, 'Father, I stretch my hands to Thee;
No other help I know;
If Thou withdraw Thyself from me,
Ah, wither shall I go?

On Thy dear Son I now believe,
O let me feel Thy power;
And all my varied wants relieve,
In this accepted hour.

Author of faith! To Thee I lift
My weary, longing eyes;
O let me now receive that gift;
My soul without it dies.

Surely Thou canst not let me die;
O speak, and I shall live;
And here I will unwearied lie,
Till Thou Thy Spirit give.

How would my fainting soul rejoice
Could I but see Thy face!
Now let me hear Thy quickening voice,
And taste Thy pardoning grace.

I do believe, I now believe
That Jesus died for me,
And that He shed His precious blood
From sin to set me free.'),
(487, 'I come to the garden alone,
While the dew is still on the roses;
And the voice I hear, falling on my ear,
The Son of God discloses.

Refrain:
And He walks with me,  and He talks with me,
And He tells me I am His own;
And the joy we share as we tarry there,
None other has ever known.

He speaks, and the sound of His voice
Is so sweet the birds hush their singing,
And the melody that He gave to me
Within my heart is ringing.

I''d stay in the garden with Him
Though the night around me be falling,
But He bids me go; through the voice of woe,
His voice to me is calling.'),
(488, 'At first I prayed for light:
Could I but see the way,
How gladly, swiftly would I walk
To everlasting day!

And next I prayed for strength:
That I might tread the road
With firm, unfaltering feet, and win
The heaven''s serene abode.

And then I asked for faith:
Could I but trust my God,
I''d live infolded in His peace,
Though foes were all abroad.

But now I pray for love:
Deep love to God and man;
A living love that will not fail,
However dark His plan.

And light and strength and faith
Are opening everywhere!
God waited patiently until
I prayed the larger prayer.'),
(489, 'Jesus, lover of my soul,
Let me to thy bosom fly,
While the billows near me roll,
While the tempest still is high;
Hide me, O my Savior, hide!
Till the storm of life is past;
Safe into the haven guide,
O receive my soul at last!

Other refuge has I none,
Hangs my helpless soul on thee;
Leave O leave me not alone!
Still support and comfort me;
All my trust on Thee is stayed,
All my help from Thee I bring;
Cover my defenseless head
With the shadow of Thy wing.

Thou, O Christ, all I want,
More than all in Thee I find;
Raise the fallen, cheer the faint,
Heal the sick, and lead the blind.
Just and holy is Thy name,
I am all unrighteousness;
Vile and full of sin I am;
Thou art full of truth and grace.

Plenteous grace with Thee is found-
Grace to pardon all my sin;
Let the healing streams abound,
Make and keep me pure within;
Thou of life the Fountain art,
Freely let me take of Thee;
Spring Thou up within my heart,
Rise to all eternity.'),
(490, 'Jesus, lover of my soul, let me to Thy bosom fly,
While the nearer waters roll, while the tempest still is high.
Hide me, O my Savior, hide, till the storm of life is past;
Safe into the haven guide; O receive my soul at last.

Other refuge have I none, hangs my helpless soul on Thee;
Leave, ah! leave me not alone, still support and comfort me.
All my trust on Thee is stayed, all my help from Thee I bring;
Cover my defenseless head with the shadow of Thy wing.

Thou, O Christ, art all I want, more than all in Thee I find;
Raise the fallen, cheer the faint, heal the sick, and lead the blind.
Just and holy is Thy Name, I am all unrighteousness;
False and full of sin I am; Thou art full of truth and grace.

Plenteous grace with Thee is found, grace to cover all my sin;
Let the healing streams abound; make and keep me pure within.
Thou of life the fountain art, freely let me take of Thee;
Spring Thou up within my heart; rise to all eternity.')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(491, 'In the hour of trial, Jesus, plead for me,
Lest by base denial I depart from Thee;
When Thou see''st me waver, with a look recall,
Nor, for fear or favor, suffer me to fall.

With forbidden pleasures would this vain world charm;
Or its sordid treasures spread to work me harm;
Bring to my remembrance sad Gethsemane,
Or, in darker semblance, cross-crowned Calvary.

Should Thy mercy send me sorrow, toil, and woe,
Or should pain attend me on my path below,
Grant that I may never fail Thy hand to see;
Grant that I may ever cast my care on Thee.'),
(492, 'Teach, me, Father, what to say;
Teach me, Father, how to pray;
Teach me all along the way
How to be like Jesus.

Refrain:
I would be like Jesus,
I would be like Jesus!
Help me, Lord, to daily grow
More and more like Jesus!

Teach me as the days go by,
Teach me not to reason why,
Teach me that to do and die,
Is to be like Jesus.

Teach me that the time is short,
Teach me how to live and work,
Teach me that to never shirk
Is to be like Jesus.

Teach me how we may be one,
Like the Father and the Son;
And when all is overcome,
I will be like Jesus.'),
(493, 'Like the woman at the well I was seeking
For things that could not satisfy:
And then I heard my Savior speaking:
" Draw from my well that never shall run dry".

Refrain:
Fill my cup Lord, I lift it up, Lord!
Come and quench this thirsting of my soul;
Bread of heaven, Feed me till I want no more--
Fill my cup, fill it up and make me whole!

There are millions in this world who are craving
The pleasures earthly things afford;
But none can match the wondrous treasure
That I find in Jesus Christ my Lord.

So, my brother, if the things this world gave you
Leave hungers that won''t pass away,
My blessed Lord will come and save you,
If you kneel to Him and humbly pray:'),
(494, '"We would see Jesus;" for the shadows lengthen
Across the little landscape of our life;
We would see Jesus, our weak faith to strengthen
For the last conflict, in this mortal strife.

"We would see Jesus," Rock of our salvation,
Where on our feet were set with sovereign grace;
Not life, nor death, with all their agitation,
Can thence remove us, gazing on His face.

"We would see Jesus;" other lights are paling,
Which for long years we did rejoice to see;
The blessings of this sinful world are failing;
We would not mourn them, in exchange for Thee.

"We would see Jesus;" this is all we''re needing-
Strength, joy and willingness come with the sight;
We would see Jesus, dying, risen, pleading,
Soon to return and end this mortal night!'),
(495, 'There is a place of quiet rest,
near to the heart of God;
a place where sin cannot molest,
near to the heart of God.

Refrain:
O Jesus, blest Redeemer,
sent from the heart of God,
hold us who wait before thee
near to the heart of God.

There is a place of comfort sweet,
near to the heart of God;
a place where we our Savior meet,
near to the heart of God.

There is place a place of full release,
near to the heart of God;
a place where all is joy and peace,
near to the heart of God.'),
(496, 'Eternal Love, we have no good to bring Thee,
No single good of all our hands have wrought,
No worthy music have we found to sing Thee,
No jewelled word, no quick up soaring thought.

And yet we come; and when our faith would falter
Show us, O Love, the quiet place of prayer,
The golden censer and the golden altar,
And the great angel waiting for us there.'),
(497, 'O gracious Father of mankind,
Our spirits'' unseen friend;
High heaven''s Lord, our hearts'' dear guest,
To Thee our prayers ascend.
Thou dost not wait till human speech
Thy gifts divine implore;
Our dreams, our aims, our work, our lives
Are prayers Thou lovest more.

Thou hearest these, the good and ill,
Deep buried in each breast;
The secret thought, the hidden plan,
Wrought out our unexpressed.
O cleanse our prayers from human dross,
Attune our lives to Thee,
Until we labor for those gifts
We ask on bended knee.

Our best is but Thyself in us,
Our highest thought Thy will;
To hear Thy voice we need but love,
And listen, and be still.
We would not bend Thy will to ours,
But blend our wills to Thine;
Not dreams, our aims, our work, our lives
Are prayers Thou lovest more.

Thou seekest us in love and truth
More than our minds seek Thee;
Through open gates Thy power flows in
Like flood tides from the sea.
No more we seek Thee from afar,
Nor ask Thee for a sign,
Content to pray in life and love
And toil, till all are Thine.'),
(498, 'Still, still with Thee, when purple morning breaketh,
When the bird waketh, and the shadows flee;
Fairer than morning, lovelier than daylight,
Dawns the sweet consciousness, I am with Thee.

Alone with Thee, amid the mystic shadows,
The solemn hush of nature newly born;
Alone with Thee in breathless adoration,
In the calm dew and freshness of the morn.

Still, still with Thee! As to each newborn morning
A fresh and solemn splendor still is given,
So does this blessed consciousness, awaking,
Breathe each day nearness unto Thee and heaven.

So shall it be at last, in that bright morning,
When the soul waketh and life''s shadows flee;
O in that hour, fairer than daylight dawning,
Shall rise the glorious thought, I am with Thee.'),
(499, 'What a friend we have in Jesus,
All our sins and griefs to bear!
What a privilege to carry
Everything to God in prayer!
Oh, what peace we often forfeit;
Oh, what needless pain we bear
All because we do not carry
Everything to God in prayer!

Have we trials and temptations?
Is there trouble anywhere?
We should never be discouraged
Take it to the Lord in prayer.
Can we find a friend so faithful
Who will all our sorrows share?
Jesus knows our every weakness
Take it to the Lord in prayer.

Are we weak and heavy laden,
Cumbered with a load of care?
Precious Savior, still our refuge
Take it to the Lord in prayer.
Do your friends despise, forsake you?
Take it to the Lord in prayer.
In his arms he''ll take and shield you;
You will find a solace there.'),
(500, 'Take time to be holy,
speak oft with thy Lord;
abide in him always,
and feed on his word.
Make friends of God''s children,
help those who are weak,
forgetting in nothing
his blessing to seek.

Take time to be holy,
the world rushes on;
spend much time in secret
with Jesus alone.
By looking to Jesus,
like him thou shalt be;
thy friends in thy conduct
his likeness shall see.

Take time to be holy,
let him be thy guide,
and run not before him,
whatever betide.
In joy or in sorrow,
still follow the Lord,
and, looking to Jesus,
still trust in his word.

Take time to be holy,
be calm in thy soul,
each thought and each motive
beneath his control.
Thus led by his spirit
to fountains of love,
thou soon shalt be fitted
for service above.'),
(501, '''Tis the blessed hour of prayer, when our hearts lowly bend,
And we gather to Jesus, our Savior and Friend;
If we come to Him in faith, His protection to share,

Refrain:
What a balm for the weary! O how sweet to be there!
Blessed hour of prayer, Blessed hour of prayer,
What a balm for the weary! O how sweet to be there!

''Tis the blessed hour of prayer, when the Savior draws near,
With a tender compassion His children to hear;
When He tells us we may cast at His feet every care,

''Tis the blessed hour of prayer, when the tempted and tried
To the Savior who loves them their sorrows confide;
With a sympathizing heart He removes every care;

''Tis the blessed hour of prayer, trusting Him we believe,
That the blessings we''re needing we''ll surely receive;
In the fullness of this trust we shall lose every care;'),
(502, 'Sun of my soul, O Savior dear!
It is not night if Thou be near;
O may no earth-born cloud arise
To hide Thee from Thy servant''s eyes.

When soft the dews of kindly sleep
My weary eyelids gently steep,
Be my last thought how sweet to rest
Forever on my Savior''s breast!

Abide with me from morn till eve,
For without Thee I cannot live;
Abide with me when night is nigh,
For without Thee I dare not die.

Be near and bless me when I wake,
Ere through the world my way I take;
Till in the ocean of Thy love
I lose myself in heaven above.'),
(503, 'There is a quiet place,
Far from the rapid pace where God can soothe my troubled mind.
Sheltered by tree and flow''r,
There in my quiet hour with Him my cares are left behind.
Whether a garden small,
Or on a mountain tall,
New strength and courage there I find;
Then from this quiet place
I go prepared to face a new day
With love for all mankind.'),
(504, 'Lord Jesus, think on me, And purge away my sin;
From earth-born passions set me free, And make me pure within.

Lord Jesus, think on me, With care and woe oppressed;
Let me Thy loving servant be, And taste Thy promised rest.

Lord Jesus, think on me, Nor let me go astray;
Through darkness and perplexity Point Thou the heavenly way.

Lord Jesus, think on me, That I may sing above
To Father, Spirit, and to Thee, The strains of praise and love.'),
(505, 'I need the prayers of those I love,
While trav''ling o''er life''s rugged way,
That I may true and faithful be,
And live for Jesus every day.

Refrain:
I want my friends to pray for me,
To bear my tempted soul above,
And intercede with God for me;
I need the prayers of those I love.

I need the prayers of those I love,
To help me in each trying hour,
To bear my tempted sould to Him,
That He may keep me by His pow''r.

I want my friends to pray for me,
To hold me up on wing of faith,
That I may walk the narrow way,
Kept by our Father''s glorious grace.'),
(506, 'A mighty fortress is our God,
a bulwark never failing;
our helper he amid the flood
of mortal ills prevaling.
For still our ancient foe
doth seek to work us woe;
his craft and power are great,
and armed with cruel hate,
on earth is not his equal.

Did we in our own strength confide,
our striving would be losing,
were not the right man on our side,
the man of God''s own choosing.
Dost ask who that may be?
Christ Jesus, it is he;
Lord Sabbaoth, his name,
from age to age the same,
and he must win the battle.

And though this world, with devils filled,
should threaten to undo us,
we will not fear, for God hath willed
his truth to triumph through us.
The Prince of Darkness grim,
we tremble not for him;
his rage we can endure,
for lo, his doom is sure;
one little word shall fell him.

That word above all earthly powers,
no thanks to them, abideth;
the Spirit and the gifts are ours,
thru him who with us sideth.
Let goods and kindred go,
this mortal life also;
the body they may kill;
God''s truth abideth still;
his kingdom is forever.'),
(507, 'Dying with Jesus, by death reckoned mine,
Living with Jesus, a new life divine,
Looking to Jesus till glory doth shine,
Moment by moment, O Lord, I am Thine.

Refrain:
Moment by moment I''m kept in His love;
Moment by moment I''ve life from above;
Looking to Jesus till glory doth shine;
Moment by moment, O Lord, I am Thine.

Never a trial that He is not there,
Never a burden that He doth not bear,
Never a sorrow that He doth not share,
Moment by moment I''m under His care.

Never a heart-ache, and never a groan,
Never a teardrop and never a moan;
Never a danger but there on teh throne,
Moment by moment He thinks of His own.

Never a weakness that He doth not feel,
Never a sickness that He cannot heal;
Moment by moment, in woe or in weal,
Jesus, my Savior, abides with me still.'),
(508, 'Anywhere with Jesus I can safely go,
Anywhere He leads me in this world below;
Anywhere without Him dearest joys would fade;
Anywhere with Jesus I am not afraid.

Refrain:
Anywhere, anywhere! Fear I cannot know;
Anywhere with Jesus I can safely go.

Anywhere with Jesus I am not alone;
Other friends may fail me, He is still my own;
Though His hand may lead me over drearest ways,
Anywhere with Jesus is a house of praise.

Anywhere with Jesus I can go to sleep,
When the darkening shadows round about me creep,
Knowing I shall waken nevermore to roam;
Anywhere with Jesus will be home, sweet home.'),
(509, 'How firm a foundation, ye saints of the Lord,
is laid for your faith in his excellent word!
What more can he say than to you he hath said,
to you who for refuge to Jesus have fled?

"Fear not, I am with thee, O be not dismayed,
for I am thy God and will still give thee aid;
I''ll strengthen and help thee, and cause thee to stand
upheld by my righteous, omnipotent hand."

"When through deep waters I call thee to go,
the rivers of woe shall not thee overflow;
for I will be with thee, thy troubles to bless,
and sanctify to thee thy deepest distress."

"When through fiery trials thy pathways shall lie,
my grace, all-sufficient, shall be thy supply;
the flame shall not hurt thee; I only design
thy dross to consume, and thy gold to refine."

"The soul that on Jesus hath leaned for respose,
I will not, I will not depart to His foes;
That soul, though all hell should endeavor to shake,
I''ll never, no never, no never forsake!"'),
(510, 'If you but trust in God to guide you
And place your confidence in Him,
You''ll find Him always there beside you,
To give you hope and strength within.
For those who trust God''s changeless love
Build on the rock that will not move.

What gain is there in futile weeping,
In helpless anger and distress?
If you are in His care and keeping,
In sorrow will He love you less?
For He who took for you a cross
Will bring you safe through every loss.

In patient trust await His leisure
In cheerful hope, with heart content
To take whate''er your Father''s pleasure
And all discerning love have sent;
Doubt not your inmost wants are known
To Him who chose you for His own.

Sing, pray, and keep His ways unswerving,
Offer your service faithfully,
And trust His word; though undeserving,
You''ll find His promise true to be.
God never will forsake in need
The soul that trusts in Him indeed.'),
(511, 'I know not why God''s wondrous grace To me He hath made known,
Nor why, unworthy, Christ in love Redeemed me for His own.

Refrain:
But "I know whom I have believed, and am persuaded that His is able
To keep that which I''ve committed Unto Him against that day."

I know not how this saving faith To me He did impart,
Nor how believing in His word Wrought peace within my heart.

I know not how the Spirit moves, Convincing men of sin,
Revealing Jesus through the word, Creating faith in Him.

I know not when my Lord may come, At night or noonday fair,
Nor if I walk the vale with Him, Or meet Him in the air.'),
(512, 'Just when I need Him, Jesus is near,
Just when I falter, just when I fear;
Ready to help me, ready to cheer,
Just when I need Him most.
Just when I need Him most,
Just when I need Him most,
Jesus is near to comfort and cheer,
Just when I need Him most.

Just when I need Him, Jesus is true,
Never forsaking, all the way through,
Giving for burdens pleasures anew,
Just when I need Him most.
Just when I need Him most,
Just when I need Him most,
Jesus is near to comfort and cheer,
Just when I need Him most.

Just when I need Him, Jesus is strong,
Bearing my burdens all the day long;
For all my sorrow giving a song,
Just when I need Him most.
Just when I need Him most,
Just when I need Him most,
Jesus is near to comfort and cheer,
Just when I need Him most.

Just when I need Him, He is my all,
Answering when upon Him I call;
Tenderly watching lest I should fall,
Just when I need Him most.
Just when I need Him most,
Just when I need Him most,
Jesus is near to comfort and cheer,
Just when I need Him most.'),
(513, 'In heavenly love abiding, No change my heart shall fear;
And safe is such confiding, For nothing changes here.
The storm may roar without me, My heart may low be laid;
But God is round about me, And can I be dismayed?

Wherever He may guide me, No want shall turn me back;
My Shepherd is besided me, And nothing can I lack.
His wisdom ever waketh, His sight is never dim;
He knows the way He taketh, And I will walk with Him.

Green pastures are before me, Which yet I have not seen;
Bright skies will soon be o''er me, Where darkest clouds have been.
My hope I cannot measure, My path to life is free;
My Savior has my teasure, And He will walk with me.'),
(514, 'Lord of our life, and God of our salvation,
Star of our night, and hope of every nation,
Hear and receive Thy church''s supplication,
Lord God Almighty.

Lord, Thou canst help when earthly armor faileth;
Lord, Thou canst save when deadly sin assaileth;
Lord, o''er Thy rock nor death nor hell prevaileth;
Grant us Thy peace, Lord

Peace in our hearts our evil thoughts assuaging;
Peace in Thy church, where brothers are engaging;
Peace, when the world its busy war is waging;
Send us, O Savior.

Grant us Thy help till foes are backward driven;
Grant them Thy truth that they may be forgiven;
Grant peace on earth, and, after we have striven,
Peace in Thy heaven.'),
(515, 'The Lord is my light; then why should I fear?
By day and by night His presence is near;
He is my salvation from sorrow and sin;
This blessed persuasion the Spirit brings in.

Refrain:
The Lord is my light, my joy, and my song;
By day and by night He leads me along;
The Lord is my light, my joy, and my song;
By day and by night He leads me along.

The Lord is my light; though clods may arise,
Faith, stronger than sight, looks up to the skies
Where Jesus forever in glory doth reign:
Then how can I ever in darkness remain?

The Lord is my light, the Lord is my strength;
I know in His might I''ll conquer at length;
My weakness in mercy He covers with power,
And, walking by faith, He upholds me each hour.

The lord is my light, my all and in all;
There is in His sight no darkness at all;
He is my Redeemer, my Savior and King;
With saints and with angels His praises I sing.'),
(516, 'All the way my Savior leads me;
What have I to ask beside?
Can I doubt His tender mercy,
Who through life has been my guide?
Heavenly peace, divinest comfort,
Here by faith in Him to dwell;
For I know whate''er befall me,
Jesus doeth all things well;
For I know whate''er befall me,
Jesus doeth all things well.

All the way my Savior leads me;
Cheers each winding path I tread;
Gives me grace for every trial,
Feeds me with the living bread;
Though my weary steps may falter,
And my soul athirst may be,
Gushing from the Rock before me,
Lo, a spring of joy I see;
Gushing from the Rock before me,
Lo, a spring of joy I see.

All the way my Savior leads me;
O the fullness of His love!
Perfect rest to me is promised
In my Father''s house above;
When I wake to life immortal,
Wing my flight to realms of day,
This my song through endless ages,
Jesus led me all the way;
This my song through endless ages,
Jesus led me all the way.'),
(517, 'My faith looks up to thee,
thou Lamb of Calvary,
Savior divine;
Now hear me while I pray,
take all my guilt away,
O let me from this day
be wholly Thine.

May thy rich grace impart
strength to my fainting heart,
my zeal inspire!
As thou hast died for me,
O may my love to thee
pure, warm, and changeless be,
a living fire!

While life''s dark maze I tread,
and griefs around me spread,
be thou my guide;
bid darkness turn to day,
wipe sorrow''s tears away,
nor let me ever stray
from Thee aside.'),
(518, 'Standing on the promises of Christ my King,
Thru eternal ages let His praises ring;
Glory in the highest I will shout and sing,
Standing on the promises of God.

Refrain:
Standing, standing,
Standing on the promises
of God my Savior;
Standing, standing,
I''m standing on the promises of God.

Standing on the promises that cannot fail,
When the howling storms of doubt and fear assail,
By the living word of God I shall prevail,
Standing on the promises of God.

Standing on the promises of Christ the Lord,
Bound to Him eternally by love''s strong cord,
Overcoming daily with the Spirit''s sword,
Standing on the promises of God.'),
(519, 'Give to the winds your fears;
In hope be undismayed:
God hears your sighs and coundts your tears,
God shall lift up your head.

To Him commit your griefs;
Your ways put in His hands
To His sure truth adn tender care
Who earth adn heave commands.

O put your trust in God;
In duty''s path go on.
Walk in His strength with faith and hope,
So shall your work be done.

Leave to His sovereign sway
To choose and to command;
So you shall, faithful, seek His way
how wise, how strong His hand!'),
(520, 'A wonderful Savior is Jesus my Lord,
A wonderful Savior to me,
He hideth my soul in the cleft of the rock,
Where rivers of pleasure I see.

Refrain:
He hideth my soul in the cleft of the rock
That shadows a dry, thirsty land;
he hideth my life in the depths of His love,
And covers me there with His hand,
And covers me there with His hand.

A wonderful Savior is Jesus my Lord,
He taketh my burden away,
He holdeth me up, and I shall not be moved,
He giveth me strength as my day.

With numberless blessings each moment He crowns,
And filled with His fullness divine,
I sing in my rapture, Oh, Glory to God
For such a Redeemer as mine.

When clothed in His brightness, transported I rise
To meet Him in clouds of the sky,
His perfect salvation, His wonderful love,
I''ll shout with the millions on high.'),
(521, 'Depth of mercy!--can there be
Mercy still reserved for me?
Can my God His wrath forbear?
Me, the chief of sinners, spare?

I have long withstood His grace,
Long provoked Him to His face,
Would not hearken to His calls,
Grieved Him by a thousand falls.

Now incline me to repent;
Let me now my sins lament;
Now my foul revolt deplore,
Weep, believe, and sin no more.

There for me the Savior stands,
Shows His wounds and spreads His hands;
God is love! I know, I feel;
Jesus weeps, and loves me still.'),
(522, 'My hope is built on nothing less
than Jesus'' blood and righteousness.
I dare not trust the sweetest frame,
but wholly lean on Jesus'' name.

Refrain:
On Christ the solid rock I stand;
all other ground is sinking sand,
all other ground is sinking sand.

When Darkness veils his lovely face,
I rest on his unchanging grace.
in every high and stormy gale,
my anchor holds within the veil.

His oath, his covenant, his blood
supports me in the whelming flood.
When all around my soul gives way,
he then is all my hope and stay.

When He shall come with trumpet sound,
O may I then in him be found!
Dressed in his righteousness alone,
faultless to stand before the throne.'),
(523, 'My faith has found a resting place,
Not in a manmade creed;
I trust the ever living One,
That He for me shall plead.

Refrain:
I need no other evidence,
I need no other plea;
It is enough that Jesus died,
And rose again for me.

Enough for me that Jesus saves,
This ends my fear and doubt;
A sinful soul, I come to Him,
He will not cast me out.

My soul is resting on the Word,
The living Word of God,
Salvation in my Savior''s name,
Salvation through His blood.

My great Physician heals the sick,
The lost He came to save;
For me His precious blood He shed,
For me His life He gave.'),
(524, '''Tis so sweet to trust in Jesus,
and to take him at his word;
just to rest upon his promise,
and to know, "Thus saith the Lord."

Refrain:
Jesus, Jesus, how I trust him!
How I''ve proved him o''er and o''er!
Jesus, Jesus, precious Jesus!
O for grace to trust him more!

O how sweet to trust in Jesus,
just to trust his cleansing blood;
and in simple faith to plunge me
neath the healing, cleansing flood!

Yes, ''tis sweet to trust in Jesus,
just from sin and self to cease;
just from Jesus simply taking
life and rest, and joy and peace.

I''m so glad I learned to trust thee,
precious Jesus, Savior, friend;
and I know that thou art with me,
wilt be with me to the end.'),
(525, 'O safe to the Rock that is higher than I,
My soul in its conflicts and sorrows would fly;
So sinful, so weary, Thine, Thine, would I be;
Thou blest "Rock of Ages," I''m hiding in Thee.

Refrain:
Hiding in Thee, hiding in Thee,
Thou blest "Rock of Ages,"
I''m hiding in Thee.

In the calm of the noontide, in sorrow''s lone hour,
In times when temptation casts over me its power;
In the tempests of life, on its wide, heaving sea,
Thou blest "Rock of Ages," I''m hiding in Thee.

How oft in the conflict, when pressed by the foe,
I have fled to my refuge and breathed out my woe;
How often, when trials like sea billows roll,
Have I hidden in Thee, O Thou Rock of my soul.'),
(526, 'God sent His Son, they called His Jesus,
He came to love, heal, and forgive;
He lived and died to buy my pardon,
An empty grave is there to prove my Savior lives.

Refrain:
Because He lives I can face tomorrow,
Because He lives all fear is gone;
Because I know He holds the future.
And life is worth the living just because He lives.

How sweet to hold a newborn baby,
And feel the pride, and joy He gives;
But greater still the calm assurance,
This child can face uncertain days because He lives.'),
(527, 'From every stormy wind that blows, From every swelling tide of woes,
There is a calm, a sure retreat: ''Tis found beneath the mercy seat.

There is a place where Jesus sheds The oil of gladness on our heads,
A place than all besides more sweet; It is the blood-bought mercy seat.

There is a scene where spirits blend, Where friend holds fellowship with friend;
Though sundered far, by faith they meet Around one common mercy seat.

There, there, on angel''s wings we soar, And earthly cares molest no more,
And heaven comes down our souls to greet, And glory crowns the mercy seat.

Ah! whither should we flee for aid, When tempted, desolate dismayed?
Or how the hosts of sin defeat, Had suffering saints no mercy seat?'),
(528, 'The Lord''s our Rock, in Him we hide,
A shelter in the time of storm;
Secure whatever ill betide,
A shelter in the time of storm.

Refrain:
Mighty Rock in a weary land,
Cooling shade on the burning sand,
Faithful guide for the pilgrim band--
A shelter in the time of storm.

A shade by day, defense by night,
A shelter in the time of storm;
No fears alarm, no foes afright,
A shelter in the time of storm.

The raging storms may round us beat,
A shelter in the time of storm
We''ll never leave our safe retreat,
A shelter in the time of storm.

O Rock divine, O Refuge dear,
A Shelter in the time of storm;
Be Thou our helper ever near,
A Shelter in the time of storm.'),
(529, 'Under His wings I am safely abiding;
Though the night deepens and tempests are wild,
Still I can trust Him; I know He will keep me;
he has redeemed me, and I am His child.

Refrain:
Under His wings, under His wings,
Who from His love can sever?
Under His wings, my soul shall abide,
Safely abide forever.

Under His wings, what a refuge in sorrow!
How the heart yearningly turns to its rest!
Often when earth has no balm for my healing,
There I find comfort, and there I am blest.

Under His wings, O what precious enjoyment!
There will I hide till life''s trials are over;
Sheltered, protected, no evil can harm me;
Resting in Jesus I''m safe evermore.'),
(530, 'When peace, like a river, attendeth my way,
when sorrows like sea billows roll;
whatever my lot, thou hast taught me to say,
It is well, it is well with my soul.

Refrain:
It is well with my soul,
it is well, it is well with my soul.

My sin--oh, the joy of this glorious thought--
My sin, not in part but the whole,
is nailed to the cross, and I bear it no more,
praise the Lord, praise the Lord, O my soul!

And, Lord, haste the day when my faith shall be sight,
the clouds be rolled back as a scroll;
the trump shall resound, and the Lord shall descend,
even so, it is well with my soul.'),
(531, 'We''ll build on the Rock, the living Rock,
On Jesus, the Rock of Ages;
So shall we abide the fearful shock,
When loud the tempest rages.

Refrain:
We''ll build on the Rock,
We''ll build on the Rock;
We''ll build on the Rock, on the solid Rock,
On Christ, the mighty Rock.

Some build on the sinking sands of life,
On visions of earthly treasure;
Some build on the waves of sin and strife,
Of fame, and worldly pleasure.

O build on the Rock, for ever sure,
The firm and the true foundation;
Its hope is the hope which shall endure,
The hope of our salvation.'),
(532, 'Day by day, and with each passing moment,
Strength I find, to meet my trials here;
Trusting in my Father''s wise bestowment,
I''ve no cause for worry or for fear.
He whose heart is kind beyond all measure
Gives unto each day what He deems best.
Lovingly, its part of pain and pleasure,
Mingling toil with peace and rest.

Every day, the Lord Himself is near me
With a special mercy for each hour;
All my cares He fain would bear, and cheer me,
He whose name is Counselor and power.
The protection of His child and treasure
Is a charge that on Himself He laid;
As your days, your strength shall be in measure,
This the pledge to me He made.

Help me then in every tribulation
So to trust Thy promises, O Lord,
That I lose not faith''s sweet consolation
Offered me within Thy holy Word.
Help me, Lord, when toil and trouble meeting,
E''er to take, as from a father''s hand,
One by one, the days, the moments fleeting,
Till I reach the promised land.'),
(533, 'O, for a faith that will not shrink,
Though pressed by many a foe,
That will not tremble on the brink of poverty,
Of poverty or woe; Of poverty or woe;

That will not murmur or complain
Beneath the chastening rod,
But in the hour of grief or pain, of grief or pain
Can lean upon its God; Can lean upon its God.

A faith that shines more bright and clear
When tempests rage without;
That when in danger knows no fear, knows of no fear,
In darkness feels no doubt; In darkness feels no doubt.

That bears unmoved the world''s dread frown,
Nor heeds its scornful smile;
That sin''s wild ocean cannot drown, no, cannot drown,
Nor its soft arts beguile; Nor its soft arts beguile.

Lord, give me such a faith as this,
And then, whate''er may come
I''ll taste, e''en here the hallowed bliss, the hallowed bliss
Of an eternal home; Of an eternal home.'),
(534, 'Will your anchor hold in the storms of life,
When the clouds unfold their wings of strife?
When the strong tides lift, and the cables strain,
Will your anchor drift or firm remain?

Refrain:
We have an anchor that keeps the soul
Steadfast and sure while the billows roll,
Fastened to the Rock which cannot move,
Grounded firm and deep in the Savior''s love.

It is safely moored, ''twill the storm withstand,
For ''tis well secured by the Savior''s hand;
And the cables passed from His heart to mine,
Can defy the blast, through strength divine.

It will firmly hold in the straits of fear,
When the breakers have told the reef is near;
Though the tempest rave and the wild winds blow,
Not an angry wave shall our bark o''erflow.

It will surely hold in the floods of death,
When the waters cold chill our latest breath;
On the rising tide it can never fail,
While our hopes abide within the veil.

When our eyes behold, in the dawning light,
Shining gates of pearl, our harbor bright,
We shall anchor fast to the heavenly shore,
With the storms all past forevermore.'),
(535, 'I am trusting Thee, Lord Jesus,
Trusting only Thee;
Trusting Thee for full salvation,
Great and free.

I am trusting Thee for pardon;
At Thy feet I bow;
For Thy grace and tender mercy,
Trusting now.

I am trusting Thee to guide me;
Thou alone shalt lead;
Every day and hour supplying
All my need.

I am trusting Thee, Lord Jesus;
Never let me fall;
I am trusting Thee forever,
And for all.'),
(536, 'Infinite in time and place,
Flung the suns in burning radiance
Through the silent fields of space;
We, Your children in Your likeness,
Share inventive powers with You;
Great Creator, still creating,
Show us what we yet may do.

We have ventured worlds undreamed of
Since the childhood of our race;
Knowing the ecstasy of winging
Through untraveled realms of space,
Probed the secrets of the atom,
Yielding unimagined power,
Facing us with life''s destruction
Or our most triumphant hour.

As each far horizon beckons,
May it challenge us anew:
Children of creative purpose,
Serving others, honoring You.
May our dreams prove rich with promise;
Each endeavor well begun;
Great Creator, give us guidance
Till our goals and Yours are one.'),
(537, 'He leadeth me: O blessed thought!
O words with heavenly comfort fraught!
Whate''er I do, where''er I be,
still ''tis God''s hand that leadeth me.

Refrain:
He leadeth me, he leadeth me,
by his own hand he leadeth me;
his faithful follower I would be,
for by his hand he leadeth me.

Sometimes mid scenes of deepest gloom,
sometimes where Eden''s bowers bloom,
by waters still, o''er troubled sea,
still ''tis his hand that leadeth me.

Lord, I would place my hand in thine,
nor ever murmur nor repine;
content, whatever lot I see,
since ''tis my God that leadeth me.

And when my task on earth is done,
when by thy grace the victory''s won,
e''en death''s cold wave I will not flee,
since God through Jordan leadeth me.'),
(538, 'Guide me, O thou great Jehovah,
pilgrim through this barren land.
I am weak, but thou art mighty;
hold me with thy powerful hand.
Bread of heaven, bread of heaven,
feed me till I want no more;
feed me till I want no more.

Open now the crystal fountain,
whence the healing stream doth flow;
let the fire and cloudy pillar
lead me all my journey through.
Strong deliverer, strong deliverer,
be thou still my strength and shield;
be thou still my strength and shield.

When I tread the verge of Jordan,
bid my anxious fears subside;
death of death and hell''s destruction,
land me safe on Canaan''s side.
Songs of praises, songs of praises,
I will ever give to thee;
I will ever give to thee.'),
(539, 'I will early seek the Savior,
I will learn of Him each day;
I will follow in His footsteps,
I will walk the narrow way.

Refrain:
For He loves me, yes, He loves me,
Jesus loves me, this I know.
Jesus loves me, died to save me,
This is why I love Him so.

I will hasten where He bids me,
I am not too young to go
In the pathway where He leadeth,
Not too young His will to know.

He is standing at the doorway
Of escape from every sin;
I will knock, for He has promised,
He will hear and let me in.'),
(540, 'Gentle Jesus, meek and mild,
Look upon a little child;
Pity my simplicity,
Suffer me to come to Thee.

Lamb of God, I look to Thee;
Thou shalt my example be;
Thou art gentle, meek, and mild,
Thou wast once a little child.

Fain I would be as Thou art;
Give me Thy obedient heart;
Thou art pitiful and kind,
Let me have Thy loving mind.

I shall then show forth Thy praise,
Serve Thee all my happy days;
Then the world shall always see
Christ, the Holy Child, in me.'),
(541, 'Lord, speak to me, that I may speak
in living echoes of thy tone;
as thou has sought, so let me seek
thine erring children lost and lone.

O lead me, Lord, that I may lead
the wandering and the wavering feet;
O feed me, Lord, that I may feed
thy hungering ones with manna sweet.

O strengthen me, that while I stand
firm on the rock, and strong in thee,
I may stretch out a loving land
to wrestlers with the troubled sea.'),
(542, 'Jesus, Friend, so kind and gentle,
Little ones we bring to Thee:
Grant to them Thy dearest blessing,
Let Thine arms around them be;
Now enfold them in Thy goodness,
From all danger keep them free.

Thou who did receive the children
To Thyself so tenderly,
Give to all who teach and guide them
Wisdom and humility.
Vision true to keep them noble,
Love to serve them faithfully.'),
(543, 'Jesus, Friend of little children,
Be a friend to me;
Take my hand and ever keep me
Close to Thee.

Teach me how to grow in goodness,
Daily as I grow;
Thou hast been a child, and surely
Thou dost know.

Step by step, O, lead me onward,
Upward into youth;
Wiser, stronger, still becoming
In Thy truth.

Never leave me, nor forsake me;
Ever be my friend;
For I need Thee from life''s dawning
To its end.'),
(544, 'Jesus, Son of blessed Mary,
Once on earth a little child,
Pattern fair of holy living,
Gracious, loving, undefiled;

Though Thy eager heart was yearning
Heavy laden souls to free,
Yet Thou calledst little children
In their happiness to Thee.

Grant that we, like little children,
Free from pride and guile my be;
Cheerful, trusting, safe, protected
By the blessed Trinity.'),
(545, 'Savior, like a shepherd lead us,
much we need thy tenderest care;
in thy pleasant pastures feed us,
for our use thy folds prepare.
Blessed Jesus, blessed Jesus!
Thou hast bought us, thine we are.
Blessed Jesus, blessed Jesus!
Thou hast bought us, thine we are.

We are thine, thou dost befriend us,
be the guardian of our way;
keep thy flock, from sin defend us,
seek us when we go astray.
Blessed Jesus, blessed Jesus!
Hear, O hear us when we pray.
Blessed Jesus, blessed Jesus!
Hear, O hear us when we pray.

Thou hast promised to receive us,
poor and sinful though we be;
thou hast mercy to relieve us,
grace to cleanse and power to free.
Blessed Jesus, blessed Jesus!
We will early turn to thee.
Blessed Jesus, blessed Jesus!
We will early turn to thee.'),
(546, 'The Lord''s my shepherd, I''ll not want
He makes me down to lie
In pastures green; he leadeth me
The quiet waters by.
He leadeth me, He leadeth me
The quiet waters by.

My soul he doth restore again
And me to walk doth make
Within the paths of righteousness
Even for his own name''s sake.
Within the paths of righteousness
Even for his own name''s sake.

Yea, though I walk through death''s dark vale
Yet will I fear no ill
For thou art with me, and thy rod
And staff me comfort still.
For thou art with me, and thy rod
And staff me comfort still.

My table thou has furnished
In presence of my foes;
My head thou dost with oil anoint
And my cup overflows.
My head thou dost with oil anoint
And my cup overflows.

Goodness and mercy all my life
Shall surely follow me,
And in God''s house for evermore
My dwelling-place shall be.
And in God''s house for evermore
My dwelling-place shall be.'),
(547, 'Be Thou my Vision, O Lord of my heart;
Naught be all else to me, save that Thou art
Thou my best Thought, by day or by night,
Waking or sleeping, Thy presence my light.

Be Thou my Wisdom, and Thou my true Word;
I ever with Thee and Thou with me, Lord;
Thou my great Father, I Thy true son;
Thou in me dwelling, and I with Thee one.

Riches I heed not, nor man''s empty praise,
Thou mine Inheritance, now and always:
Thou and Thou only, first in my heart,
High King of Heaven, my Treasure Thou art.

High King of Heaven, my victory won,
May I reach Heaven''s joys, O bright Heaven''s Sun!
Heart of my own heart, whatever befall,
Still be my Vision, O Ruler of all.'),
(548, 'Now praise the hidden God of love
In whom we all must live and move,
Who shepherds us, at every stage
Thro'' youth, maturity, and age.

Who challenged us, when were young
To storm the citadels of wrong;
In care for others taught us how
God''s true community must grow.

Who bids us never lose our zest,
Tho'' age is urging us to rest,
But proves to us that we have still
A work to do, a place to fill.

Then talk no more of wasted time,
But Godward look, and upward climb,
Content to sleep, when day is done,
And rise refreshed, and travel on.'),
(549, 'Loving Shepherd of Thy sheep,
Keep Thy lamb, in safety keep;
Nothing can Thy power withstand;
None can pluck me from Thy hand.

Loving Shepherd, ever near,
Teach Thy lamb Thy voice to hear;
Suffer not my steps to stray
From the straight and narrow way.

Where Thou leadest I would go,
Walking in Thy steps below,
Till within the heavenly fold
I my Shepherd shall behold.'),
(550, 'Every flow''r that grows, Every brook that flows,
Tell of beauty God has giv''n for me:
Throughout my life may beauty be
Deep within a heart from sin set free.

Gracious Lord above, Looking down in love,
Guide my thoughts, my life, in my walk with Thee,
That day by day the world may see
Christ, the Lord and Savior, lives in me.

All my earthly days, I shall sing and praise
God the Father, Spirit, and Christ with the Son.
Grant faith when life on earth is done,
I shall sing with those whose rest is won.'),
(551, 'Jesus, Savior, pilot me
over life''s tempestuous sea;
unknown waves before me roll,
hiding rock and treacherous shoal.
Chart and compass come from thee;
Jesus, Savior, pilot me.

As a mother stills her child,
thou canst hush the ocean wild;
boisterous waves obey thy will,
when thou sayest to them, "Be still!"
Wondrous sovreign of the sea,
Jesus, Savior, pilot me.

When at last I near the shore,
and the fearful breakers roar
''twixt me and the peaceful rest,
then, while leaning on thy breast,
may I hear thee say to me,
"Fear not, I will pilot thee.'),
(552, 'The Lord''s my Shepherd, I''ll not want.
He makes me down to lie
In pastures green; He leadeth me
The quiet waters by.

My soul He doth restore again.
And me to walk doth make
Within the paths of righteousness,
E''en for His own name''s sake.

Yea, though I walk in death''s dark vale,
Yet will I fear no ill,
For Thou art with me; and Thy rod
And staff me comfort still.

My table Thou hast furnished
In presence of my foes;
My head Thou dost with oil anoint,
And my cup overflows.

Goodness and mercy all my life
Shall surely follow me;
And in God''s house forevermore
My dwelling place shall be.'),
(553, 'Jesus, guide our way
To eternal day:
So shall we, no more delaying,
Follow Thee, Thy voice obeying:
Lead us by the hand
To our Father''s land.

When we danger meet
Steadfast make our feet;
Lord, preserve us uncomplaining
Mid the darkness round us reigning:
Through adversity lies our way to Thee.

Order all our way
Through the mortal day:
In our toil, with aid be near us:
In our need, with succour cheer us:
Till we safely stand
In our Father''s land.'),
(554, 'O let me walk with Thee, my God,
As Enoch walked in days of old;
Place Thou my trembling hand in Thine,
And sweet communion with me hold;
E''en though the path I may not see,
Yet, Jesus, let me walk with Thee.

I cannot, dare not, walk alone;
The tempest rages in the sky,
A thousand snares beset my feet,
A thousand foes are lurking nigh.
Still Thou the raging of the sea,
O Master! let me walk with Thee.

If I may rest my hand in Thine,
I''ll count the joys of earth but loss,
And firmly, bravely journey on;
I''ll bear the banner of the cross
Till Zion''s glorious gates I see;
Yet, Savior, let me walk with Thee.'),
(555, 'Shepherd of tender you,
Guiding in love and truth,
Through devious way;
Christ our triumphant King,
We come Thy name to sin,
Hither our children bring
To shout Thy praise.

Thou are our holy Lord,
Thee all subduing Word,
Healer of strife;
Thou didst Thyself abase,
That from sin''s deep disgrace
Thou mightest save our race,
And give us life.

Thou are the great High Priest;
Thou has prepared the feast
Of heavenly love;
While in our mortal pain
None call on Thee in vain;
Help Thou does not disdain,
Help from above.

Ever be Thou our Guide,
Our Shepherd and our pride,
Our staff and song;
Jesus, Thou Christ of God,
By Thy perennial word,
Lead us where Thou hast trod,
Make our faith strong.'),
(556, 'As saints of old their first fruits brought
Of orchard, flock, and field
To God the giver all good,
The source of bounteous yield;
So we today first fruits would bring:
The wealth of this good land,
Of farm and market, shop and home,
Of mind, and heart, and hand.

A world in need now summons us
To labor, love, and give;
To make our life an offering
To God, that all may live.
The Church of Christ is calling us
To make the dream come true:
A world redeemed by Christ-like love;
All life in Christ made new.

In gratitude and humble trust
We bring our best today,
To serve Your cause and share Your love
With all along life''s way.
O God, who gave yourself to us
In Jesus Christ Your Son,
Teach us to give ourselves each day
Until life''s work is done.'),
(557, 'Come, ye thankful people, come,
Raise the song of harvest home;
All is safely gathered in,
Ere the winter storms begin.
God our Maker doth provide
For our wants to be supplied;
Come to God''s own temple, come;
Raise the song of harvest home!

We ourselves are God''s own field,
Fruit unto His praise to yield;
Wheat and tares together sown,
Unto joy or sorrow grown;
First the blade and then the ear,
Then the full corn shall appear;
Grant, O harvest Lord, that we
Wholesome grain and pure may be.

For the Lord our God shall come,
And shall take His harvest home;
From His field shall purge away
All that doth offend, that day;
Give His angels charge at last
In the fire the tares to cast;
But the fruitful ears to store
In His garner evermore.

Then, thou church triumphant, come,
Raise the song of harvest home;
All are safely gathered in,
Free from sorrow, free from sin,
There, forever purified,
In God''s garner to abide;
Come, ten thousand angels, come,
Raise the glorious harvest home!'),
(558, 'For the fruits of His creation, thanks be to God;
For the gifts to every nation, thanks be to God;
For the plowing, sowing, reaping,
Silent growth while men are sleeping,
Future needs in earth''s safe keeping, thanks be to God!

In the just reward of labor, God''s will is done;
In the hop we give our neighbor, God''s will is done;
In our worldwide take of caring
For the hungry and despairing,
In the harvests men are sharing, God''s will is done.

For the harvests of His Spirit, thanks be to God;
For the good all men inherit, thanks be to God;
For the wonders that astound us,
For the truths that still confound us,
Most of all, that love has found us, thanks be to God!'),
(559, 'Now thank we all our God
with heart and hands and voices,
who wondrous things hath done,
in whom His world rejoices;
Who, from our mothers'' arms
hath blessed us on our way
with countless gifts of love,
and still is ours today.

O may this bounteous God
through all our life be near us,
with ever joyful hearts
and blessed peace to cheer us;
and keep us still in grace,
and guide us when perplexed;
and free us from all ills,
in this world and the next.

All praise and thanks to God
the Father now be given;
the Son, and Him who reigns
with them in highest heaven;
the one eternal God,
whom earth and heaven adore;
for thus it was, is now,
and shall be evermore.'),
(560, 'Let all things now living a song of thanksgiving
To God the Creator triumphantly raise,
Who fashioned and made us, protected and stayed us,
Who guideth us on to the end of our days.
His banners are o''er us,
His light goes before us,
A pillar of fire shining forth in the night,
''Til shadows have vanished and darkness is banished,
as forward we travel from light into light.

His law He enforces: the stars in their courses,
The sun in His orbit, obediently shine;
The hills and the mountains, the rivers and fountains,
The deeps of the ocean proclaim Him divine,
We too should be voicing our love and rejoicing,
With glad adoration a song let us raise,
''Til all things now living unite in thanksgiving
To God in the highest, hosanna and praise.')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(561, 'We plow the fields, and scatter the good seed on the land,
But it is fed and watered by God''s almighty hand.
He sends the snow in winter, the warmth to swell the grain,
The breezes and the sunshine, and soft refreshing rain.

Refrain:
All good gifts around us
Are sent from heaven above;
Then thank the Lord, O thank the Lord
For all His love.

He only is the Maker of all things near and far;
He paints the wayside flower, He lights the evening star.
The winds and waves obey Him, by Him the birds are fed;
Much more, to us His children, He gives our daily bread.

We thank Thee then, O Father, for all things bright and good,
The seed-time and the harvest, our life, our health, and food.
Accept the gifts we to offer for all Thy love imparts,
And, what Thou most desirest, our humble, thankful hearts.'),
(562, 'Come, sing a song of harvest, Of thanks for daily food!
To offer God the first-fruits is old as gratitude.

Long, long ago, the reapers, before they kept the feast,
Put first-fruits in a basket, and took it to the priest.

Shall we, sometimes forgetful oh where creation starts,
With science in our pockets lose wonder from our hearts?

May God, the great Creator, to whom all life belongs,
Accept these gifts we offer, our service and our songs.

And lest the world go hungry while we ourselves are fed,
Make each of us more ready to share our daily bread.'),
(563, 'Praise and thanksgiving let everyone bring
Unto our Father for every good thing.
All together joyfully sing!'),
(564, 'For sunrise hope and sunset calm, and all that lies between,
For all the sweetness and the balm that is and that has been,
For comradeship for peace in strife, and light on darkened days;
For work to do and strength for life we sing our hymn of praise.

But O, we press far, far above these gifts of pure delight,
And find in Thee, and in Thy love contentment infinite.
O Lord, beloved, in whom are found all joys of time and place,
What will it be when joy is crowned by vision of Thy face?'),
(565, 'For the beauty of the earth,
for the glory of the skies,
for the love which from our birth
over and around us lies;
Lord of all, to Thee we raise
this our grateful song of praise.

For the joy of human love,
brother, sister, parent, child,
friends on earth and friends above,
Pleasures pure and undefiled,
Lord of all, to Thee we raise
this our grateful song of praise.

For the gift of Thy dear Son,
for the hope of heaven at last,
for the Spirit''s victory won,
For the crown when life is past,
Lord of all, to Thee we raise
Songs of gratitude and praise.'),
(566, 'Father, we thank You for the light that shines all the day;
For the bright sky You have given most like Your heaven;
Father, we thank You.

Father, we thank You for the lamps that lighten the way;
For human skill''s exploration of Your creation;
Father, we thank You.

Father, we thank You for the friends who brighten our play;
For Your command to call others sisters and brothers;
Father, we thank You.

Father, we thank You for Your love in Jesus today,
Giving us hope for tomorrow through joy and sorrow;
Father, we thank You.'),
(567, 'Have thine own way, Lord! Have thine own way!
Thou art the potter, I am the clay.
Mold me and make me after thy will,
while I am waiting, yielded and still.

Have thine own way, Lord! Have thine own way!
Search me and try me, Savior today!
Wash me just now, Lord, wash me just now,
as in thy presence humbly I bow.

Have thine own way, Lord! Have thine own way!
Wounded and weary, help me I pray!
Power, all power, surely is thine!
Touch me and heal me, Savior divine!

Have thine own way, Lord! Have thine own way!
Hold o''er my being absolute sway.
Fill with thy Spirit till all shall see
Christ only, always, living in me!'),
(568, 'Make me a captive, Lord, and then I shall be free;
Force me to render up my sword, and I shall conqueror be.
I sink in life''s alarms when by myself I stand;
Imprison me within Thine arms, and strong shall be my hand.

My heart is weak and poor until it amaster find;
It has no spring of action sure, it varies with the wind.
It cannot freely move till Thou has wrought its chain;
Enslave it with Thy matchless love, and deathless it shall reign.

My will is not my own till Thou hast made it Thine;
If it would reach a monarch''s throne, it must its crown resign;
It only stands unbent, amid the clashing strife,
When on Thy bosom it has leant, and found in Thee its life.'),
(569, 'Pass me not, O gentle Savior,
hear my humble cry;
while on others thou art calling,
do not pass me by.

Refrain:
Savior, Savior, hear my humble cry;
while on others thou art calling,
do not pass me by.

Let me at thy throne of mercy
find a sweet relief,
kneeling there in deep contrition;
help my unbelief.

Trusting only in thy merit,
would I seek thy face;
heal my wounded, broken spirit,
save me by thy grace.

Thou the spring of all my comfort,
more than life to me,
whom have I on earth beside thee?
Whom in heaven but thee?'),
(570, 'Not I, but Christ, be honored, loved, exalted;
Not I, but Christ, be seen, be known, be heard;
Not I, but Christ, in every look and action,
Not I, but Christ, in every thought and word.

Not I, but Christ, to gently soothe in sorrow,
Not I, but Christ, to wipe the falling tear;
Not I, but Christ, to lift the weary burden,
Not I, but Christ, to hush away all fear.

Christ, only Christ! No idle words e''er falling,
Christ, only Christ; no needless bustling sound;
Christ, only Christ, no self important bearing;
Christ, only Christ, no trace of "I" be found.

Not I, but Christ, my every need supplying,
Not I, but Christ, my strength and health to be;
Christ, only Christ, for body, soul, and spirit,
Christ, only Christ, here and eternally.'),
(571, 'What does the Lord require for praise and offering?
What sacrifice, desire or tribute bid you bring?
Do justly; Love mercy; Walk humbly with your God.

Rulers of men, give ear! Should you not justice show?
Will God your pleading hear, while crime and cruelty grow?
Do justly; Love mercy; Walk humbly with your God.

How shall our life fulfill God''s law so hard and high?
Let Christ endue our will with grace to fortify.
Then justly, in mercy we''ll humbly walk with God.'),
(572, 'Give of your best to the master,
Give of the strength of your youth;
Throw your soul''s fresh, glowing ardor
Into the battle for truth.
Jesus has set the example -
Dauntless was He, young and brave;
Give Him your loyal devotion,
Give Him the best that you have.

Refrain:
Give of your best to the master,
Give of the strength of your youth;
Clad in salvation''s full armor,
Join in the battle for truth.

Give of your best to the Master,
Give Him first place in your heart;
Give Him first place in your service,
Consecrate every part.
Give, and to you shall be given -
God His beloved Son gave;
Gratefully seeking to serve Him,
Give Him the best that you have.

Give of your best to the Master,
Naught else is worthy His love;
He gave Himself for your ransom,
Have up His glory above;
Laid down His life without murmur,
You from sin''s ruin to save;
Give Him your heart''s adoration,
Give Him the best that you have.'),
(573, 'It may not be on the mountain height
Or over the stormy sea,
It may not be at the battle''s front
My Lord will have need of me.
But if, by a still, small voice he calls
To paths that I do not know,
I''ll answer, dear Lord, with my hand in thine;
I''ll go where you want me to go.

Refrain:
I''ll go where you want me to go, dear Lord,
Over mountain or plain or sea;
I''ll say what you want me to say, dear Lord;
I''ll be what you want me to be.

Perhaps today there are loving words
Which Jesus would have me speak
There may be now in the paths of sin
Some wand''rer whom I should seek.
O Savior, if thou wilt be my guide,
Tho dark and rugged the way,
My voice shall echo the message sweet;
I''ll say what you want me to say.

There''s surely somewhere a lowly place
In earth''s harvest fields so wide
Where I may labor through life''s short day
For Jesus, the Crucified.
So trusting my all to thy tender care,
And knowing thou lovest me,
I''ll do thy will with a heart sincere:
I''ll be what you want me to be.'),
(574, 'O Master, let me walk with thee
in lowly paths of service free;
tell me thy secret; help me bear
the strain of toil, the fret of care.

Help me the slow of heart to move
by some clear, winning word of love;
teach me the wayward feet to stay,
and guide them in the homeward way.

Teach me thy patience; still with thee
in closer, dearer company,
in work that keeps faith sweet and strong,
in trust that triumphs over wrong;

In hope that sends a shining ray
far down the future''s broadening way,
in peace that only thou canst give,
with thee, O Master, let me live.'),
(575, 'Let your heart be broken for a world in need:
Feed the mouths that hunger, soothe the wounds that bleed,
Give the cup of water and the loaf of bread
Be the hands of Jesus, serving in His stead.

Here on earth applying principles of love,
Visible expression '' God still rules above
Living illustration of the Living Word
To the minds of all who''ve Never seen or heard.

Blest to be a blessing privileged to care,
Challenged by the need apparent everywhere.
Where mankind is wanting, fill the vacant place.
Be the means through which the Lord reveals His grace.

Add to your believing deeds that prove it true,
Knowing Christ as Savior, make Him Master, too.
Follow in His footsteps, go where He has trod;
In the world''s great trouble risk yourself for God.

Let your heart be tender and your vision clear;
See mankind as God sees, serve Him far and near.
Let your heart be broken by a brother''s pain;
Share your rich resources, give and give again.'),
(576, 'Awake, awake to love and work!
The lark is in the sky;
The fields are wet with diamond dew;
The worlds awake to cry
Their blessings on the Lord of life,
As He goes meekly by.

Come, let thy voice be one with theirs,
Shout with their shout of praise;
See how the giant sun soars up,
Great lord of years and days!
So let the love of Jesus come
And set thy soul ablaze.

To give and give, and give again,
What God hath given thee;
To spend thyself nor count the cost;
To serve right gloriously
The God who gave all worlds that are,
And all that are to be.'),
(577, 'In the heart of Jesus there is love for you,
Love most pure and tender, love most deep and true;
Why should you be lonely, why for friendship sigh,
When the heart of Jesus has a full supply?

In the mind of Jesus there is thought for you,
Warm as summer sunshine, sweet as morning dew;
Why should you be fearful, why take anxious thought,
Since the mind of Jesus cares for those He bought?

In the field of Jesus there is work for you;
Such as even angels might rejoice to do;
Why stand idly sighing for some lifework grand,
While the field of Jesus seeks your reaping hand?

In the home of Jesus there''s a place for you;
Glorious, bright, and joyous, calm and peaceful too;
Why then, like a wanderer, roam with weary pace,
If the home of Jesus holds for you a place?'),
(578, 'So sent I you- by grace made strong to triumph
O''er hosts of hell, o''er darkness, death, and sin,
May name to bear, and in that name to conquer-
So send I you, My victory to win.

So send I you- to take to souls in bondage
The word of truth that sets the captive fee,
To break the bonds of sin, to loose dearth''s fetters-
So send I you, to bring the lost to Me.

So send I you- My strength to know in weakness,
My joy in grief, my perfect peace in pain,
To prove My power, My grace, My promised presence-
So send I you, eternal fruit to gain.

So send I you- to bear My cross with patience,
And then one day with joy to lay it down,
To hear My voice, ''Well done, My faithful servant-
Come, share My throne, My kingdom, and My crown!''
''As the Father hath sent Me, so send I you.'''),
(579, '''Tis love that makes us happy,
''Tis love that smooths the way;
It helps us mind, it makes us kind
To others every day.

Refrain:
God is love; we''re his little children.
God is love; we would be like Him.
''Tis love that makes us happy,
''Tis love that smooths the way;
It helps us "mind," it makes us kind
To others every day.

This world is full of sorrow,
Of sickness, death, and sin;
With loving heart we''ll do our part,
And try some soul to win.

And when this life is over,
And we are called above
Our song shall be, eternally,
Of Jesus and His love.'),
(580, 'This little light of mine, I''m going to let it shine, (shine)
This little light of mine, I''m going to let it shine, (shine)
This little light of mine, I''m going to let it shine,
Let it shine, let it shine, let it shine.

Every where I go, I''m going to let it shine, (shine)
Every where I go, I''m going to let it shine, (shine)
Every where I go, I''m going to let it shine,
Let it shine, let it shine, let it shine.

All through the night, I''m going to let it shine, (shine)
All through the night, I''m going to let it shine, (shine)
All through the night, I''m going to let it shine,
Let it shine, let it shine, let it shine.'),
(581, 'When the church of Jesus shuts its outer door,
Lest the roar of traffic drown the voice of prayer:
May our prayers, Lord make up ten times more aware
That the world we banish is our Christian care.

If our hearts are lifted where devotion soars
High above this hungry suffering world of ours:
Lest our hymns should drug us to forget its needs,
Forge our Christian worship into Christian deeds.

Lest the gifts we offer, money, talents, time,
Serve to salve our conscience to our secret shame:
Lord, reprove, inspire us by the way you give;
Teach us, dying Savior, how true Christians live.'),
(582, 'Working, O Christ, with Thee, working with Thee,
Unworthy, sinful, weak, though we may be;
Our all to Thee we give, for Thee alone we live,
And by Thy grace achieve, working with Thee.

Along the city''s waste, working with Thee,
Our eager footsteps haste, like Thee to be;
The poor we gather in, the outcasts raise from sin,
And labor souls to win, working with Thee.

Savior, we weary not, working with Thee,
As hard as Thine our lot can never be;
Our joy and comfort this, "Thy grace sufficent is;"
This changes toil to bliss, working with Thee.

So let us labor on, working with Thee,
Till earth to Thee is won, from sin set free;
Till men, from shore to shore, receive Thee, and adore,
And join us evermore, working with Thee.'),
(583, 'You that know the Lord is gracious,
You for whom a cornerstone
Stands, of God elect and precious,
Laid that you may build there-on,
See that on that sure foundation
You a living temple raise.
Towers that may tell forth salvation,
Walls that may reech-o praise.

Living stones by God appointed
Each to his allotted place,
Kings and priests, by God anointed,
Shall you not declare His grace?
You, a royal generation,
Tell the tidings of your birth,
Tidings of a new creation
To an old and weary earth.

Tell the praise of Him who called you
Out of darkness into light,
Broke the fetters that enthralled you,
Gave you freedom, peace, and sight:
Tell the tale of sins forgiven,
Strength renewed and hope restored,
Till the earth, in tune with heaven,
Praise and magnify the Lord.'),
(584, 'There''s a Spirit in the air, telling Christians everywhere
''Praise the love that Christ revealed, living, working in our world.''

Lose your shyness, find your tongue; tell the world what God has done:
God in Christ has come to stay, we can see His pow''r today.

When believers break the bread, when a hungry child is fed:
Praise the love that Christ revealed, living, working in our world.

Still His Spirit leads the fight, seeing wrong and setting right:
God in Christ has come to stay, we can see His pow''r today.

When a stranger''s not alone, where the homeless find a home,
Praise the love that Christ revealed, living, working in our world.

May His Spirit fill our praise, guide our thoughts and change our ways.
God in Christ has come to stay, we can see His power today.

There''s a Spirit in the air, calling people everywhere;
Praise the love that Christ revealed: living, working in our world.'),
(585, 'When Christ was lifted from the earth His arms stretched out above
Through every culture, every birth, to draw an answering love.

Still east and west His love extends and always, near or far,
He calls and claims us as His friends and loves us as we are.

Where generation, class, or race divides us to our shame,
He sees not labels but a face, a person and a name.

Thus freely loved, tho'' fully known, may I in Christ be free
To welcome and accept His own as Christ accepted me.'),
(586, 'What joy it is to worship here,
And find ourselves at home,
Where God, who uses every gift,
Has room for all who come!

Yet are no two of us alike
Of all the human race,
And we must seek a common ground
If we would share His grace.'),
(587, 'In Christ there is no east nor west,
In Him no south or north;
But one great fellowship of love
Throughout the whole wide earth.

In Him shall true heart everywhere
Their high communion find;
His service is the golden cord
Close binding all mankind.

Join hands, then, brothers of the faith,
Whate''er your race may be.
Who serves my Father as a son
Is surely kin to me.

In Christ now meet both east and west,
In Him meet south and north;
All Christly souls are one in Him
Throughout the whole wide earth.'),
(588, 'Lord of all nations, grant me grace
To love all people, every race,
And in each person may I see
My kindred loved, redeemed by Thee.

Break down the wall that would divide
Thy children, Lord, on every side.
My neighbor''s good let me pursue;
Let Christian love bind warm and true.

Forgive me, Lord, where I have erred
By loveless act and thoughtless word.
Make me to see the wrong I do
Will crucify my Lord anew.

Give me Thy courage, Lord, to speak
Whenever strong oppress the weak.
Should I myself the victim be,
Help me forgive, remembering Thee.

With Thine own love may I be filled
And by Thy Holy Spirit willed,
That all I touch, where''er I be,
May be divinely touched by Thee.'),
(589, 'Holy Spirit, gracious guest,
Hear and grant our heart''s request
For that gift supreme and best:
Holy heav''nly love.

Faith that mountains could remove,
Tongues of earth or heaven above,
Knowledge, all things, empty prove
If I have no love.

Though I as a martyr bleed,
Give my goods the poor to feed,
All is vain if love I need:
Therefore give me love.

Love is kind and suffers long,
Love is pure and thinks no wrong,
Love than death it self more strong:
Therefore give us love.

Prophecy will fade away,
Melting in the light of day;
Love will ever with us stay:
Therefore give us love.

Faith and hope and love we see
Joining hand in hand agree-
But the greatest of the three,
And the best is love.'),
(590, 'When we walk with the Lord
in the light of his word,
what a glory he sheds on our way!
While we do his good will,
he abides with us still,
and with all who will trust and obey.

Refrain:
Trust and obey, for there''s no other way
to be happy in Jesus, but to trust and obey.

Not a shadow can rise,
not a cloud in the skies,
but his smile quickly drives it away;
not a doubt nor a fear,
not a sigh nor a tear,
can abide while we trust and obey.

Not a burden we bear,
not a sorrow we share,
but our toil he doth richly repay;
not a grief or a loss,
not a frown or a cross,
but is blest if we trust and obey.

But we never can prove
the delights of his love
until all on the altar we lay;
for the favor he shows,
and the joy he bestows,
are for them who will trust and obey.

Then in fellowship sweet
we will sit at his feet,
or we''ll walk by his side in the way;
what he says we will do,
where he sends we will go;
never fear, only trust and obey.'),
(591, 'In our work and in our play,
Jesus, ever with us stay;
May be always strive to be
True and faithful unto Thee.
Then we truthfully can sing,
We are children of the King.

May we in Thy strength subdue
Evil tempers, words untrue,
Thoughts impure, and deeds unkind,
All things hateful to Thy mind.
Then we truthfully can sing,
We are children of the King.

Children of the King are we!
May we loyal to Him be;
Try to please Him every day,
In our work and in our play.
Then we truthfully can sing,
We are children of the King.'),
(592, 'Watchman, tell us of the night what its signs of promise are.
Traveler, o''er yon mountain''s height, see that glory beaming star.
Watchman, does its beauteous ray aught of joy or hope foretell?
Traveler, yes; it brings the day, promised day of Israel.

Watchman, tell us of the night, higher yet that star ascends.
Traveler, blessedness and light, peace and truth its course portends.
Watchman, will its beams alone gild the spot that gave them birth?
Traveler, ages are its own; See it bursts o''er all the earth.

Watchman, tell us of the night, for the morning seems to dawn.
Traveler, darkness takes its flight, doubt and terror are withdrawn.
Watchman, let your wanderings cease; hasten to your quiet home.
Traveler, lo, the Prince of Peace, lo, the Son of God is come!'),
(593, 'In times like these you need a Savior,
In times like these you need and anchor;
Be very sure, be very sure Your anchor holds and grips the Solid rock!
This Rock is Jesus, Yes, He''s the One;
This Rock is Jesus, The only One!
Be very sure, be very sure Your anchor holds and grips the Solid rock!

In times like these you need the Bible,
In times like these O be not idle;
Be very sure, be very sure Your anchor holds and grips the Solid rock!
This Rock is Jesus, Yes, He''s the One;
This Rock is Jesus, The only One!
Be very sure, be very sure Your anchor holds and grips the Solid rock!

In times like these I have a Savior,
In times like these I have an anchor
I''m very sure, be very sure Your anchor holds and grips the Solid rock!
This Rock is Jesus, Yes, He''s the One;
This Rock is Jesus, The only One!
I''m very sure, be very sure Your anchor holds and grips the Solid rock!'),
(594, 'Heir of the kingdom, O why dost thou slumber?
Why art thou sleeping so near thy blest home?
Wake thee, arouse thee, and gird on thine armor,
Speed, for the moments are hurrying on.

Heir of the kingdom, say, why dost thou linger?
How canst thou tarry in sight of the prize?
Up, and adorn thee, the Savior is coming;
Haste to receive Him descending the skies.

Earth''s mighty nations, in strife and commotion,
Tremble with terror, and sink in dismay;
Listen, ''tis nought but the chariot''s loud rumbling;
Heir of the kingdom, no longer delay.

Stay not, O stay not for earth''s vain allurements!
See how its glory is passing away;
Break the strong fetters the foe hath bound o''er thee;
Heir of the kingdom, turn, turn thee away.

Keep the eye single, the head upward lifted;
Watch for the glory of earth''s coming King;
Lo! o''er the mountaintops light is now breaking;
Heirs of the kingdom, rejoice ye and sing.'),
(595, 'Let every lamp be burning bright,
The darkest hour is nearing;
The darkest hour of earth''s long night,
Before the Lord''s appearing.

Refrain:
Then trim your lamps, my brethren dear,
Then trim your lamps with godly fear;
The Master''s coming draweth near,
Let every lamp be burning.

Though thousands calmly slumber on,
The last great message spuring,
Wel''ll rest our living faith upon
His promise of returning.

His word our lamp, His truth our guide,
We cannot be mistaken;
Though dangers rise on every side,
We shall not be forsaken.

Then let good works with faith appear,
To help the world atound us;
Obedience bring the blessing near
When faith has firmly bound us.'),
(596, 'Look for the way-marks as you journey on,
Look for the way-marks passing one by one;
Down through the ages, past the kingdoms four''
Where are we standing? Look the way-marks o''er.

Refrain:
Look for the way-marks, the great prophetic way-marks,
Down through the ages, past the kingdoms four.
Look for the waymarks, the great prophetic way-marks;
The journey''s almost o''er.

First, the Assyrian kingdom ruled the world,
Then Medo-Persia''s banners were unfurled;
And after Greece held universal sway,
Rome seized the scepter''where are we today?

Down in the feet of iron and of clay,
Weak and divided, soon to pass away;
What will the next great, glorious drama be?
Christ and His coming, and eternity.'),
(597, 'Ye servants of the Lord,
Each in his office wait,
Observant of His heavenly Word,
And watchful at His gate.

Let all your lamps be bright,
And trim the golden flame,
Gird up your loins as in His sight,
His coming thus proclaim.

Watch, ''tis your Lord''s command,
And while we speak He''s near;
Mark the first signal of His hand,
And ready all appear.

O happy servant, he,
In such a posture found!
He shall His Lord with rapture see,
And be with honor crowned.'),
(598, 'Watch, ye saints, with eyelids waking;
Lo! The powers of heaven are shaking;
Keep your lamps all trimmed an burning,
Ready for your Lord''s returning.

Refrain:
Lo! He comes, lo! Jesus comes;
Lo! He come, He comes all glorious!
Jesus comes to reign victorious,
Lo! He comes, yes, Jesus comes.

Lo! the promise of your Savior,
Pardoned sin and purchased favor,
Blood-washed robes and crowns of glory;
Haste to tell redemption''s story.

Kingdoms at their base are crumbling,
Hark! His chariot wheels are rumbling;
Tell, O tell of grace abounding,
While the seventh trump is sounding.

Nations wane, though proud and stately;
Christ His kingdom hasteneth greatly;
Earth her latest pangs is summing;
Shout, ye saints, your Lord is coming.

Sinners, come, while Christ is pleading;
Now for you He''s interceding;
Haste, ere grace and time diminished
Shall proclaim the mystery finished.'),
(599, 'Rejoice, rejoice, believers, and let your lights appear:
The evening is advancing, and darker night is near.
The Bridegroom is arising, and soon He draweth nigh.
Up, pray, and watch, and wrestle, at midnight comes the cry.

The watchers on the mountain proclaim the Bride-groom near.
Go, meet Him as He cometh, with hallelujahs clear.
The marriage feast is waiting, the gates wide open stand;
Up, up, you heirs of glory, the Bride-groom is at hand.

You saints who here in patience your cross and suff''rings bore,
Shall live and reign forever, when sorrow is no more.
Upon the throne of glory the Lamb you shall behold,
In triumph cast before Him your diadems of gold!

Our hope and expectation, O Jesus, now appear;
Arise, O sun so longed for, o''er this benighted sphere!
With hearts and hands uplifted, we plead, O Lord, to see
The day of earth''s redemption that brings us unto Thee.'),
(600, 'Sweet promise is given to all who believe--
"Behold I come quickly, Mine own to receive;
Hold fast till I come; the danger is great;
Sleep not as do others; be watchful, and wait."

Refrain:
"Hold fast till I come," sweet promise of heaven--
"The kingdom restored, to you shall be given."
"Come, enter My joy, sit down on the throne;
Bright crowns are in waiting; hold fast till I come."

We''ll "watch unto prayer" with lamps burning bright;
He comes to all others a "thief in the night."
We know He is near, but know not the day--
As spring shows that summer is not far away.

Yes! this is our hope, ''tis built on His word--
The glorious appearing of Jesus, our Lord;
Of promises all, it stands as the sum:
"Behold I come quickly; hold fast till I come."'),
(601, 'Watchmen, on the walls of Zion,
What O tell us, of the night?
Is the daystar now arising?
Will the morn soon greet our sight?
O''er your vision Shine there now
some rays of light?
O''er your vision Shine there now
some rays of light?

Tell, O tell us, are the landmarks
On our voyage all passed by?
Are we nearing now the haven?
Can we e''en the land descry?
Do we truly See the heavenly kingdom nigh?
Do we truly See the heavenly kingdom nigh?

Light is beaming, day is coming!
Let us sound aloud the cry;
We behold the daystar rising
Pure and bright in yonder sky!
Saints, be joyful; Your redemption draweth nigh;
Saints, be joyful; Your redemption draweth nigh.

We have found the chart and compass,
And are sure the land is near;
Onward, onward we are hasting,
Soon the haven will appear;
Let your voices Sound aloud your holy cheer;
Let your voices Sound aloud your holy cheer.'),
(602, 'O brother be faithful! soon Jesus will come,
For whom we have waited so long;
O, soon we shall enter our glorious home,
And join in the conqueror''s song.
O brother be faithful! for why should we prove
Unfaithful to Him who had shown
Such deep, such unbounded and infinite love
Who died to redeem us His own.

O brother be faithful! the city of gold,
Prepared for the good and the blest,
Is waiting its portals of pearl to unfold,
And welcome thee into thy rest.
Then, brother be faithful! not long shall we stay
In weariness here, and forlorn,
Time''s dark night of sorrow is wearing away,
We haste to the glorious morn.

O brother be faithful! He soon will descend,
Creation''s omnipotent King,
While legions of angels His chariot attend,
And palm wreaths, of victory bring.
O brother be faithful! and soon shalt thou hear
They Savior pronounce the glad word,
Well done, faithful servant, they title is clear,
To enter the joy of thy Lord.

O brother be faithful! eternity''s years
Shall tell for thy faithfulness now,
When bright smiles of gladness shall scatter thy tears,
A coronet gleam on thy brow.
O brother be faithful! the promise is sure,
That waits for the faithful and tried;
To reign with the ransomed, immortal and pure,
And ever with Jesus abide.'),
(603, 'Christian, seek not yet repose, Cast thy dreams of ease away;
Thou aret in teh midst of foes; Watch and pray!

Gird thy heavenly armor on, Wear it ever, night and day;
Ambushed lies the evil one; Watch and pray!

Hear the victors who o''ercame; Still they mark each warrior''s way;
All with one sweet voice exclaim: "Watch and pray!"

Hear, above all, hear thy Lord, Him thou lovest to obey;
Hide within thy heart His word; "Watch and pray!"

Watch, as if on that alone Hung the issue of teh day;
Pray that help may be send down; Watch and pray!'),
(604, 'We know not the hour of the Master''s appearing;
Yet signs all foretell that the moment is nearing
When He shall return ''tis the promise most cheering
But we know not the hour.

Refrain:
He will come, let us watch and be ready;
He will come, hallelujah! hallelujah!
He will come in the clouds of His Father''s
bright glory but we know not the hour.

There''s light for the wise who are seeking salvation;
There''s truth in the book of the Lord''s revelation;
Each prophecy points to the great comsummation
But we know not the hour.

We''ll watch and we''ll pray, with our lamps trimmed and burning;
We''ll work and we''ll wait till the Master''s returning;
We''ll sing and rejoice, every omen discerning
But we know not the hour.'),
(605, 'My soul, be on they guard!
Ten thousand foes arise;
The hosts of sin are pressing hard
To draw thee from the skies.

O watch, and fight, and pray!
The battle ne''er give o''er;
Renew it boldly every day,
And help divine implore.

Ne''er think the victory won,
Nor lay thine armor down;
Thy arduous task will not be done
Till thou obtain the crown.'),
(606, 'Once to every man and nation, comes the moment to decide,
In the strife of truth with falsehood, for the good or evil side;
Some great cause, some great decision, offering each the bloom or blight,
And the choice goes by forever, ''twixt that darkness and that light.

Then to side with truth is noble, when we share her wretched crust,
Ere her cause bring fame and profit, and ''tis prosperous to be just;
Then it is the brave man chooses while the coward stands aside,
Till the multitude make virtue of the faith they had denied.

By the light of burning martyrs, Christ, Thy bleeding feet we track,
Toiling up new Calv''ries ever with the cross that turns not back;
New occasions teach new duties, time makes ancient good uncouth,
They must upward still and onward, who would keep abreast of truth.

Though the cause of evil prosper, yet the truth alone is strong;
Though her portion be the scaffold, and upon the throne be wrong;
Yet that scaffold sways the future, and behind the dim unknown,
Standeth God within the shadow, keeping watch above His own.'),
(607, 'God of grace and God of glory,
On Thy people pour Thy power;
Now fulfill Thy church''s story,
Bring her bud to glorious flower.
Grant us wisdom, grant us courage,
For the facing of this hour.

Lo, the hosts of evil round us
Scorn Thy Christ, assail His ways;
From the fears that long have bound us
Free our hearts to faith and praise.
Grant us wisdom, grant us courage,
For the facing of this hour.

Cure Thy children''s warring madness,
Bend our pride to Thy control;
Shame our wanton selfish gladness
Rich in goods and poor in soul.
Grant us wisdom, grant us courage,
Lest we miss Thy kingdom''s goal.

Set our feet on lofty places,
Gird our lives that they may be
Armored with all Christ-like graces
In the fight to set all free.
Grant us wisdom, grant us courage,
That we fail not man nor Thee.'),
(608, 'Encamped along the hills of light,
Ye Christian soldiers, rise,
And press the battle ere the night
Shall veil the glowing skies.
Against the foe in vales below,
Let all our strength be hurled;
Faith is the victory, we know,
That overcomes the world.

Refrain:
Faith is the victory!
Faith is the victory!
Oh, glorious victory
That overcomes the world.

His banner over us in love,
Our sword the Word of God;
We tread the road the saints above
With shouts of triumph trod.
By faith they, like whirlwind''s breath,
Swept on o''er ev''ry field;
The faith by which they conquered death
Is still our shining shield.

To him who overcomes the foe
White raiment shall be giv''n;
Before the angels he shall know
His name confessed in heav''n.
Then onward from the hills of light,
Our hearts with love aflame;
We''ll vanquish all the hosts of night,
In Jesus'' conq''ring name.'),
(609, 'Am I a soldier of the cross,
a follower of the Lamb,
and shall I fear to own his cause,
or blush to speak his name?

Must I be carried to the skies
on flowery beds of ease,
while others fought to win the prize,
and sailed through bloody seas?

Are there no foes for me to face?
Must I not stem the flood?
Is this vile world a friend to grace,
to help me on to God?

Sure I must fight, if I would reign;
increase my courage, Lord
I''ll bear the toil, endure the pain,
supported by thy word

Thy saints in all this glorious war
shall conquer though they die;
they see the triumph from afar,
by faith they bring it nigh

When that illustrious day shall rise,
and all thy armies shine
in robes of victory through the skies,
the glory shall be thine'),
(610, 'O Christian, awake! ''tis the Master''s command;
With helmet and shield, and a sword in thy hand,
To meet the bold tempter, go, fearlessly go,
Then stand like the brave, with thy face to the foe.

Refrain:
Stand like the brave, stand like the brave,
Stand like the brave, with thy face to the foe.

The cause of thy Master with vigor defend;
Be watchful, be zealous, and fight to the end;
Wherever He leads thee, go, valiantly go,
Then stand like the brave, with thy face to the foe.

Press on, never doubting, thy Captain is near,
With grace to supply, and with comfort to cheer;
His love, like a stream in the desert will flow;
Then stand like the brave, with thy face to the foe.'),
(611, 'Awake, my soul! stretch every nerve,
And press with vigor on;
A heavenly race demands thy zeal,
And an immortal crown.

''Tis God''s all animating voice
That calls thee from on high;
''Tis He whose hand presents the prize
To thine aspiring eye.

A cloud of witnesses around
Hold thee in full survey;
Forget the steps already trod,
And onward urge thy way.

Blest Savior, introduced by Thee,
Our race have we begun;
And, crowned with victory, at Thy feet
We''ll lay our trophies down.'),
(612, 'Onward, Christian soldiers, marching as to war,
with the cross of Jesus going on before.
Christ, the royal Master, leads against the foe;
forward into battle see his banners go!

Refrain:
Onward, Christian soldiers, marching as to war,
with the cross of Jesus going on before.

Like a mighty army moves the church of God;
brothers, we are treading where the saints have trod.
We are not divided, all one body we,
one in hope and doctrine, one in charity.

Crowns and thrones my perish, kingdoms rise and wane,
but the church of Jesus constant will remain.
Gates of hell can never ''gainst that church prevail;
we have Christ''s own promise, and that cannot fail.

Onward then, ye people, join our happy throng,
blend with ours your voices in the triumph song.
Glory, laud, and honor unto Christ the King,
this through countless ages men and angels sing.'),
(613, 'Fight the good fight with all thy might;
Christ is thy strength, and Christ thy right;
Lay hold on life and it shall be
Thy joy and crown eternally.

Run the straight race through God''s good grace;
Lift up thine eyes, and seek His face.
Life with its path before us lies;
Christ is the way, and Christ the prize.

Cast care aside, lean on thy guide,
His boundless mercy will provide;
Trust, and the trusting soul shall prove
Christ is its life, and Christ its love.

Faint not, nor fear, His arms are near;
He changeth not, and thou art dear.
Only believe, and thou shalt see
That Christ is all in all to thee.'),
(614, 'Sound the battle cry,
See! the foe is nigh;
Raise the standard high
For the Lord;
Gird your armor on,
Stand firm, every one,
Rest your cause upon His holy word.

Refrain:
Rouse, then soldiers!
rally round the banner!
Ready, steady, pass the word along;
Onward, forward, shout aloud hosanna!
Christ is Captain of the mighty throng.

Strong to meet the foe,
Marching on we go,
While our cause we know
Must prevail;
Shield and banner bright,
Gleaming in the light,
Battling for the right,
We ne''er can fail.

O Thou God of all,
Hear us when we call,
Help us, one and all,
By Thy grace;
When the battle''s done,
And the victory won,
May we wear the crown
Before Thy face.'),
(615, 'Rise up, O men of God!
His kingdom tarries long.
Bring in the day of brotherhood
and end the night of wrong.

Let women all rise up!
Have done with lesser things.
Give heart and mind and soul and strength
to serve the King of kings.

Rise up, courageous youth!
The church for you doth wait,
her strength unequal to her task;
rise up, and make her great!

Lift high the cross of Christ!
Tread where his feet have trod.
Disciples of the Son of Man,
rise up, O church of God!'),
(616, 'Soldiers of Christ,arise,
And put your armor on,
Strong in the strength which God supplies
Through His eternal Son
Strong in the Lord of hosts,
And in His mighty power,
Who in the strength of Jesus trusts
Is more than conqueror.

Stand then in His great might,
With all His strength endued,
But take, to arm you for the fight,
The panoply of God;
That, having all things done,
And all your conflicts passed,
Ye may o''ercome through Christ alone,
And stand entire at last.

From strength to strength go on,
Wrestle and fight and pray,
Tread all the powers of darkness down
And win the well-fought day.
Still let the Spirit cry
In all His soldiers, "Come!"
Till Christ the Lord who reigns on high
Shall take the conquerors home.'),
(617, 'We are living, we are dwelling, In a grand and awful time,
In an age on ages telling-- To be living is sublime.
Hark! the waking up of nations, Gog and Magog to the fray;
Hark! what soundeth? Is creation Groaning for her latter day?

Christian, rouse and arm for conflict, Nerve thee for the battlefield;
Bear the helmet of salvation, And the mighty gospel shield;
Let the breastplate, peace, be on thee, Take the Spirit''s sword in hand;
Boldly, fearlessly, go forth then, In Jehovah''s strength to stand.

And the prince of evil spirits, Great deceiver of the world!
He who at the blessed Jesus Once his deadly weapons hurled,
Cometh with unwonted power, Knowing that his reign will cease
When the kingdom shall be given To the mighty Prince of Peace.

Christians, rouse! fight in this warfare, Cease not till the victory''s won;
Till your Captain loud proclaimeth, "Servant of the Lord, well done!"
He, alone, who thus is faithful, Who abideth to the end,
Hath the promise, in the kingdom An eternity to spend.'),
(618, 'Stand up, stand up for Jesus! ye soldiers of the cross;
Lift high His royal banner, it must not suffer loss:
From vict''ry unto vict''ry, His army shall He lead,
Till every foe is vanquished, and Christ is Lord indeed.

Stand up, stand up for Jesus! The trumpet call obey:
Forth to the mighty conflict, in this His glorious day;
Ye that are men now serve Him against unnumbered foes;
Let courage rise with danger, and strength to strength oppose.

Stand up, stand up for Jesus! Stand in His strength alone,
The arm of flesh will fail you, ye dare not trust your own;
Put on the gospel armor, and watching unto prayer,
Where calls the voice of duty, be never wanting there.

Stand up, stand up for Jesus! the strife will not be long;
This day the noise of battle, the next the victor''s song;
To him that overcometh a crown of life shall be;
He with the King of glory shall reign eternally.'),
(619, 'Lead on, O King eternal,
the day of march has come;
henceforth in fields of conquest
thy tents shall be our home.
Through days of preparation
thy grace has made us strong;
and now, O King eternal,
we lift our battle song.

Lead on, O King eternal,
till sin''s fierce war shall cease,
and holiness shall whisper
the sweet amen of peace.
For not with swords loud clashing,
nor roll of stirring drums;
with deeds of love and mercy
the heavenly kingdom comes.

Lead on, O King eternal,
we follow, not with fears,
for gladness breaks like morning
where''er thy face appears.
Thy cross is lifted o''er us,
we journey in its light;
the crown awaits the conquest;
lead on, O God of might.'),
(620, 'On Jordan''s stormy banks I stand,
And cast a wishful eye
To Canaan''s fair and happy land,
Where my possessions lie.

Refrain:
I am bound for the promised land,
I am bound  for the promised land;
O who will come and go with me?
I am bound for the promised land.

O''er all those wide extended plain
Shines one eternal day;
There, Christ, the Sun, for ever reigns,
And scatters night away.

When shall I reach that happy place,
And be forever blest?
When shall I see my Father''s face,
And in His kingdom rest?

Filled with delight, my raptured soul
Would here no longer stay;
Though Jordan''s waves around me roll,
Fearless I''d launch away.'),
(621, 'Gracious Father, guard Thy children
From the foe''s destructive power;
Save, O save them, Lord, from falling
In this dark and trying hour.
Thou wilt surely prove Thy people,
All our graces must be tried;
But Thy word illumes our pathway,
And in God we still confide.

We are in the time of waiting;
Soon we shall behold our Lord,
Wafted far away from sorrow,
To receive our rich reward.
Keep us, Lord, till Thine appearing,
Pure, unspotted from the world;
Let Thy Holy Spirit cheer us
Till Thy banner is unfurled.

With what joyful exultation
Shall the saints Thy banner see,
When the Lord for whom we''ve waited
Shall proclaim the jubilee!
Freedom from this world''s pollutions;
Freedom from all sin and pain;
Freedom from the wiles of Satan,
And from death''s destructive reign.'),
(622, 'Come, come, ye saints, no toil nor labor fear;
But with joy wend your way.
Though hard to you the journey may appear,
Grace shall be as your day.
We will have a living lord to guide,
And we can trust Him to provide;
Do this, and joy your hearts will swell:
All is well! All is well!

We''ll find the rest which God for us prepared,
When at last He will call;
Where none will come to hurt or make afraid,
He will reign over all.
We will make the air with music ring,
Shout praise to God our Lord and King:
O how we''ll make the chorus swell:
All is well! All is well!'),
(623, 'I will follow Thee, my Savior,
Wheresoe''er my lot may be.
Where thou goest I will follow;
Yes, my Lord, I''ll follow Thee.

Refrain:
I will follow Thee, my Saviour,
Thou didst shed Thy blood for me;
And though all men should forsake Thee;
By Thy grace I''ll follow Thee.

Though the road be rough and thorny,
Trackless as the foaming sea,
Thou hast trod this way before me,
And I''ll gladly follow Thee.

Though I meet with tribulations,
Sorely tempted though I be;
I remember Thou wast tempted,
And rejoice to follow Thee.

Though Thou leadest me through affliction,
Poor, forsaken though I be;
Thou wast destitute, afflicted,
And I only follow Thee.

Though to Jordan''s rolling billows,
Cold and deep, Thou leadest me,
Thou hast crossed the waves before me,
And I still will follow Thee.'),
(624, 'I want Jesus to walk with me.
I want Jesus to walk with me.
All along my pilgrim journey,
I want Jesus to walk with me.

In my trials Lord, walk with me.
In my trials Lord, walk with me.
When the shades of life are falling,
I want Jesus to walk with me.

In my sorrows, Lord, walk with me.
In my sorrows, Lord, walk with me.
When my heart within is aching,
I want Jesus to walk with me.'),
(625, 'I''m pressing on the upward way,
New heights I''m gaining every day;
Still praying as I''m onward bound,
"Lord, plant my feet on higher ground."

Refrain:
Lord, lift me up and let me stand,
By faith, on Heaven''s table land,
A higher plane than I have found;
Lord, plant my feet on higher ground.

My heart has no desire to stay
Where doubts arise and fears dismay;
Though some may dwell where those abound,
My prayer, my aim, is higher ground.

I want to live above the world,
Though Satan''s darts at me are hurled;
For faith has caught the joyful sound,
The song of saints on higher ground.

I want to scale the utmost height
And catch a gleam of glory bright;
But still I''ll pray till Heav''n I''ve found,
"Lord, plant my feet on higher ground."'),
(626, 'Let us sing a song that will cheer us by the way,
In a little while we''re going home.
For the night will end in the everlasting day,
In a little while we''re going home.

Refrain:
In a little while, In a little while,
We shall cross the billow''s foam;
We shall meet at last, When the stormy winds are past,
In a little while we''re going home.

We will do the work that our hands may find to do,
In a little while we''re going home.
And the grace of God will our daily strength renew,
In a little while we''re going home.

We will smooth the path for some weary, wayworn feet,
In a little while we''re going home.
And may loving hearts spread around an influence sweet!
In a little while we''re going home.

There''s a rest beyond, there''s relief from every care,
In a little while we''re going home;
And no tears shall fall in that city bright and fair,
In a little while we''re going home.'),
(627, 'We are climbing Jacob''s ladder,
We are climbing Jacob''s ladder,
We are climbing Jacob''s ladder,
Soldiers of the cross.

Every round goes higher, higher,
Every round goes higher, higher,
Every round goes higher, higher,
Soldiers of the cross.

Sinner, do you love my Jesus?
Sinner, do you love my Jesus?
Sinner, do you love my Jesus?
Soldiers of the cross.

If you love him, why not serve him?
If you love him, why not serve him?
If you love him, why not serve him?
Soldiers of the cross.'),
(628, 'As Jacob with travel was weary one day,
At night on a stone for a pillow he lay;
He saw in a vision a ladder so high
That its foot was on earth and its top in the sky.

Refrain:
Alleluia to Jesus who died on the tree,
And has raised up a ladder of mercy for me,
And has raised up a ladder of mercy for me.

Come let us ascend! All may climb it who will;
For the angels of Jacob are guarding it still:
And remember each step that by faith we passo''er,
Some prophet or martyr has trod it before.

And when we arrive at the haven of rest
We shall hear the glad words, "Come up hither, ye blest,
Here are regions of light, here are mansions of bliss."
O who would not climb such a ladder as this?'),
(629, 'O happy band of pilgrims,
If onward ye will tread
With Jesus as your fellow,
To Jesus as your Head!

O happy if ye labor
As Jesus did for men;
O happy if ye hunger
As Jesus hungered then!

The trials that beset you,
The sorrows ye endure,
The manifold temptations
That death alone can cure,

What are they but His jewels
Of right celestial worth?
What are they but the ladder
Set up to heaven on earth?

O happy band of pilgrims,
Look upward to the skies,
Where such a light affliction
Shall win you such a prize!'),
(630, 'Rise, my soul, and stretch thy wings, thy better portion trace;
Rise from transitory things toward heaven, thy native place;
Sun, and moon, and stars decay; time shall soon this earth remove;
Rise, my soul, and haste away to seats prepared above.

Rivers to the ocean run, nor stay in all their course;
Fire ascending seeks the sun; both speed them to their source;
So a soul that''s born of God, longs to view His glorious face,
Forward tends to His abode to rest in His embrace.

Cease, ye pilgrims, cease to mourn; press onward to the prize;
Soon our Savior will return, triumphant in the skies;
Yet a season, and you know happy entrance will be given,
All our sorrows left below, and earth exhcanged for heaven.')
) as v(number, lyrics) where h.number = v.number;

update public.community_hymns h set lyrics = v.lyrics from (values
(631, 'When on life a darkness falls,
When the mist flows chilling,
Paths and sign posts lost in doubt,
Loveless, unfulfilling,
Reach us, Jesus, from Your cross,
Though we feel forsaken;
Keep us through the aching night
Till new dawns awaken.

When the dreams and vows of youth
Painfully accuse us,
Stab our conscience, steal our worth,
Christ will not refuse us:
Peace the world cannot provide,
Daily resurrection,
Strong companion at our side
For each new direction.

Come and meet Him, Friend and lord,
Thro'' the gospel story:
Open door to life and peace,
Window into glory.
All who seek Him, soon are found,
Made His close relation:
Christ our pathway, Christ our home,
Christ our sure foundation.'),
(632, 'My heart can sing when I pause to remember,
A heartache here is but a stepping stone.
Along a trail, thats winding always upward,
this troubled world, is not my final home.

Refrain:
But until then, my heart will go on singing,
Until then, with joy I''ll carry on,
Until the day my eyes behold the city,
Until the day God calls me home.

The things of earth will dim and loose there value,
If we recall they''re borrowed for awhile;
And things of earth that cause the heart to tremble,
Remember there, will only bring a smile.'),
(633, 'Sing the wondrous love of Jesus;
Sing his mercy and his grace.
In the mansions bright and blessed
He''ll prepare for us a place.

Refrain:
When we all get to heaven,
What a day of rejoicing that will be!
When we all see Jesus,
We''ll sing and shout the victory!

While we walk the pilgrim pathway,
Clouds will overspread the sky;
But when traveling days are over,
Not a shadow, not a sigh.

Let us then be true and faithful,
Trusting, serving every day;
Just one glimpse of him in glory
Will the toils of life repay.

Onward to the prize before us!
Soon his beauty we''ll behold;
Soon the pearly gates will open;
We shall tread the streets of gold.'),
(634, 'Come, all Christians, be committed
To the service of the lord;
Make your lives for him more fitted,
Tune your hearts with one accord.
Come into His courts with gladness,
Each his sacred vows renew,
Turn away from sin and sadness,
Be transformed with life anew.

Of your time and talents give ye,
They are gifts from God above;
To be used by Christians freely
To proclaim His wondrous love.
Come again to serve the Savior,
Tithes and off''rings with you bring.
In your work, with Him find favor,
And with joy His praises sing.

God''s command to love each other
Is required of every one;
Showing mercy to one another
Mirrors His redemptive plan.
In compassion He has given
Of His love that is divine;
On the cross sins were forgiven;
Joy and peace are fully thine.

Come in praise and adoration,
All who in Christ''s name believe;
Worship Him with consecration,
Grace and love you will receive.
For His grace give Him the glory,
For the Spirit and the Word,
And repeat the gospel story
Till mankind His name has heard.'),
(635, 'Lord of all good, our gifts we bring You now;
Use them Your holy purpose to fulfill.
Tokens of love and pledges they shall be
That our whole life is offered to Your will.

We give our minds to understand Your ways;
Hands, voices, eyes to serve Your great design;
Hearts with the flame of your own love ablaze:
Thus for Your glory all our pow''rs combine.

Father, whose bounty all creation shows;
Christ, by whose willing sacrifice we live;
Spirit, from whom all life in fullness flows:
To You with grateful hearts ourselves we give.'),
(636, 'God, whose giving knows no ending,
From Your rich and endless store:
Nature''s wonder, Jesus'' wisdom,
Costly cross, grave''s shattered door.
Gifted by You, we turn to You,
Off''ring up ourselves in praise:
Thankful song shall rise forever,
Gracious donor of our days.

Skills and time are ours for pressing
Toward the goals of Christ, Your Son:
All at peace in health and freedom,
Races joined, the church made one.
Now direct our daily labor,
Lest we strive for self alone:
Born with talents, make us servants
Fit to answer at Your throne.

Treasure, too, You have entrusted,
Gain through pow''rs Your grace conferred:
Ours to use for home and kindred,
And to spread the Gospel Word.
Open wide our hands in sharing,
As we heed Christ''s ageless call.
Healing, teaching, and reclaiming,
Serving You by loving all.'),
(637, 'Son of God, eternal Savior,
Source of life and truth and grace,
Work made flesh, whose birth among us
Hallows all our human race,
You our head, who throned in glory,
For Your own will ever plead:
Fill us with Your love and pity,
Heal our wrongs, and help our need.

Bind us all as one together
In Your church''s sacred fold,
Weak and healthy, poor and wealthy,
Sad and joyful, young and old.
Is there want or pain or sorrow?
Make us all the burden share.
Are there spirits crushed and broken?
Teach us, Lord, to soothe their care.

As You, Lord, have lived for others,
So may we for others live.
Freely have Your gifts been granted;
Freely may Your servants give.
Yours the gold and Yours the silver,
Yours the wealth of land and sea;
We but stewards of Your bounty
Held in solemn trust will be.

Come, O Christ, and reign among us,
King of love and Prince of Peace;
Hush the storm of strife and passion,
Bid its cruel discords cease.
By Your patient years of toiling,
By Your silent hours of pain,
Quench our fevered thirst of pleasure,
Stem our selfish greed of gain.

Son of God, eternal Savior,
Source of life and truth and grace,
Word made flesh, whose birth among us
Hallows all our human race:
By Your praying, by Your willing
That Your people should be one,
Grant, oh, grant our hope''s fruition:
Here on earth Your will be done.'),
(638, 'wise may bring their learning,
The rich may bring their wealth,
And some may bring their greatness,
And some their strength and health:
We too would bring our treasures
To offer to the King,
We have no wealth or learning---
What shall we children bring?

We''ll bring Him hearts that love Him,
We''ll bring Him thankful praise,
And young souls meekly striving
To follow in His ways:
And these be the treasures
We offer to the King,
And these are gifts that ever
The poorest child may bring.

We''ll bring the little duties
We have to do each day;
We''ll try our best to please Him
At home, at school, at play:
And better are these treasures
To offer to the King
Than richest gift without them:
Yet these a child may bring.'),
(639, 'A diligent and grateful heart
Prompts me to sing Thy praise.
Thy love and mercies from the start
Have blessed me all my days.

I thank Thee for the means to serve
With talents and with tithes,
For sharing brings the utmost joy
When lifting other lives.

My thanks I give you for stewardship
To minister through deeds,
To serve and share with patient care
Thy people in their needs.

O Lord, I dedicate my all
In this response to Thee.
Help me to magnify this call
In deep humility.'),
(640, 'For beauty of meadows, for grandeur of trees,
For flowers of woodlands, for creatures of seas,
For all You created and gave us to share,
We praise You, Creator, extolling your care.

As stewards of beauty received at Your hand,
As creatures who hear Your most urgent command,
We turn from our wasteful destruction of life,
Confessing our failures, confessing our strife.

Teach us once again to be gardeners in peace;
All nature around us is ours but on lease;
Your name we would hallow in all that we do,
Fulfilling our calling, creating with You.'),
(641, 'God in His love for us lent us this planet,
Gave it a purpose in time and in space:
Small as a spark from the fire of creation,
Cradle of life and the home of our race.

Thanks be to God for its bounty and beauty,
Life that sustains us in body and mind:
Plenty for all, if we learn how to share it,
Riches undreamed of to fathom and find.

Long have our human wars ruined its harvest;
Long has earth bowed to the terror of forced;
Long have we wasted what others have need of,
Poisoned the fountain of life at its source.

Earth is the Lord''s: it is ours to enjoy it,
Ours, as His stewards, to farm and defend.
From its pollution, misuse, and destruction,
Good Lord, deliver us, world without end!'),
(642, 'We praise Thee with our minds, O Lord,
Kept sharp think Thy thought;
Come, Holy Ghost with grace outpoured,
To teach what Christ hath taught.
In all our learning may we seek
That wisdom from above
Which comes to all: the brave, the meek,
Who ask in faith and love.

We praise Thee thro'' our bodies, Lord,
Kept strong to do Thy will;
Thy Spirit''s temples, which afford
A means to praise Thee still.
We give ourselves, a sacrifice,
To live as unto Thee;
For Thou alone hast paid the price
To bring salvation free.

We praise Thee in our hearts, O king,
Kept pure to know Thy ways;
And raise to Thee a hymn to sing
Eternally Thy praise.
Altho adoring hearts will bow
As age on ages roll;
We praise Thee in our beings now,
Mind, body, heart, and soul.'),
(643, 'Father, who on us do shower
Gifts of plenty form Your dower,
To Your people give the power
All Your gifts to use aright.

Give pure happiness in leisure
Temperance in every pleasure,
Wholesome use of earthly treasure
Bodies clean and spirits bright.

Lift from this and every nation
All that brings us degradation;
Quell the forces of temptation;
Put Your enemies to flight.

Father, You who sought and found us,
Son of God, whose love has bound us,
Holy Spirit, in us, round us,
Hear us, Godhead infinite.'),
(644, 'O God, whose will is life and good
For all of mortal breath:
Unite in bonds of servanthood
All those who strive with death.

Make strong their hands and hearts and wills
To drive disease afar,
To strive against the body''s ills
And wage Your healing war.

By healing of the sick and blind,
Christ''s mercy they proclaim,
Make known the great physician''s mind,
Affirm the Savior''s name.

Before them set Your gracious will,
That they, with heart and soul,
To You may consecrate their skill
And make the sufferer whole.'),
(645, 'God of our fathers, Whose almighty hand
Leads forth in beauty all the starry band
Of shining worlds in splendor through the skies
Our grateful songs before Thy throne arise.

Thy love divine hath led us in the past,
In this free land by Thee our lot is cast,
Be Thou our Ruler, Guardian, Guide and Stay,
Thy Word our law, Thy paths our chosen way.

Refresh Thy people on their toilsome way,
Lead us from night to never ending day;
Fill all our lives with love and grace divine,
And glory, laud, and praise be ever Thine.'),
(646, 'To the name that brings salvation
Let the nations bow the head;
Let them kneel in adoration
When this name of names is said;
Let them pray for restoration
Of all things in Christ the head.

He through every generation
Rules in endless majesty;
May the kings of every nation
Now foreswear their enmity,
And with humble veneration
In the love of God agree.

Lord, we pray for upright rulers:
Guard them surely in their need
From the vanity of power
And the emptiness of greed;
Let them see the truth of lowness,
And on justice let them feed.'),
(647, 'Mine eyes have seen the glory of the coming of the Lord;
He is trampling out the vintage where the grapes of wrath are stored;
He has loosed the fateful lightning of His terrible swift sword;
His truth is marching on.

Refrain:
Glory! Glory! Hallelujah! Glory! Glory! Hallelujah!
Glory! Glory! Hallelujah! His truth is marching on.

He has sounded forth the trumpet that shall never call retreat;
He is sifting out the hearts of men before His judgment seat;
O be swift, my soul, to answer Him! be jubilant, my feet!
Our God is marching on.

In the beauty of the lilies Christ was born across the sea,
With a glory in His bosom that transfigures you and me;
As He died to make men holy, let us live to make men free!
While God is marching on.'),
(648, 'I vow to thee, my country, all earthly things above,
Entire and whole and perfect, the service of my love:
The love that asks the reason, the love that stands the test,
That lays upon the altar the dearest and the best;
The love that never falters, the love that pays the price,
The love that makes undaunted the final sacrifice.

And there''s another country, I''ve heard of long ago,
Most dear to them that love her, most great to them that know;
We may not count her armies, we may not see her King;
Her fortress is a faithful heart, her pride is suffering;
And one by one and fervently we pray for her increase,
And her ways are ways of gentleness, and all her paths are peace.'),
(649, 'Lord, while for all mankind we pray
Of every clime and coast,
O hear us for our native land,
The land we love the most!

O guard our shores from every foe,
With peace our borders bless;
With prosperous times our cities crown,
Our fields with plenteousness!

Unite us in the sacred love
Of knowledge, truth, and Thee;
And let our hills and valleys shout
The songs of liberty.

Lord of the nations, thus to Thee
Our country we commend;
Be Thou her Refuge and her trust,
Her everlasting friend.'),
(650, 'Our Father, by whose name,
All fatherhood is known,
Who dost in love proclaim
Each family Thine own,
Bless Thou all parents, guarding well,
With constant love as sentinel,
The homes in which Thy people dwell.

O Christ, Thyself a child
Within an earthly home,
With heart still undefiled,
Thou didst to manhood come;
Our children bless, in every place,
That they may all behold Thy face,
And knowing Thee may grow in grace.

O Spirit, who dost bind
Our hearts in unity,
Who teaches us to find
The love from self set free,
In all our hearts such love increase,
That every home, by this release,
May be dwelling place of peace.'),
(651, 'Happy the home that welcomes You, Lord Jesus,
Truest of friends, most honored of all,
Where hearts and eyes are bright wit h joy to greet You,
Your lightest wishes eager to fulfill.

Happy the home where man and wife together
Are of one mind believing in Your love:
Through love and pain, prosperity and hardship,
Through good and evil days Your care they prove.

Happy the home, O loving Friend of children,
Where they are giv''n to you with hands of prayer,
Where at Your feet they early learn to listen
To Your own Words, and thank You for your care'),
(652, 'There is beauty all around, When there''s love at home;
There is joy in every sound, When there''s love at home.
Peace and plenty here abide, Smiling fair on every side;
Time doth softly, sweetly glide, When there''s love at home.

Refrain:
Love at home, love at home;
Time doth softly, sweetly glide,
When there''s love at home.

Kindly heaven smiles above, When there''s love at home;
All the earth is fill''d with love, When there''s love at home.
Sweeter sings the brooklet by, Brighter beams the azure sky;
O, there''s One who smiles on high When there''s love at home.

Jesus, make me wholly Thine, Then there''s love at home;
May Thy sacrifice be mine, Then there''s love at home.
Safely from all harm I''ll rest, With no sinful care distress''d,
Thro'' Thy tender mercy blessed, When there''s love at home.'),
(653, 'Lead them, my God, to Thee, Lead them to Thee,
These children dear of mine, Thou gavest me;
O, by Thy love divine, Lead them, my God, to Thee;
Lead them, my God, to Thee, Lead them to Thee.

When earth looks bright and fair, Festive and gay,
Let no delusive snare Lure them astray;
But from temptation''s power, Lead them, my God, to Thee,
Lead them, my God, to Thee, Lead them to Thee.

E''en for such little ones, Christ came a child,
And in this world of sin Lived undefiled.
O, for His sake, I pray, Lead them, my God, to Thee,
Lead them, my God, to Thee, Lead them to Thee.

Yea, though my faith be dim, I would believe
That Thou this precious gift Wilt now receive;
O take their young hearts now, Lead them my God to Thee,
Lead them, my God, to Thee, Lead them to Thee.'),
(654, 'Lord, bless our homes with peace and love and laughter,
With understanding and with loyalty.
May we together follow Christ the Master
And know the blessing of His sov''reignty.

May every heart receive His loving spirit
And know the truth that makes life truly free;
Then, in that spirit may we live united,
And find in God our deep security.

Forgive the hurts our selfishness inflicted
On whose we love and those who love us best.
Christ, heal the scars and draw us all together
In Him whose will is peace and joy and rest.

Father, in gratitude for homes and loved one,
We open now our hearts to all mankind.
Grand us Your spirit love for one another
So in Your peace may we our concord find.'),
(655, 'Happy the home when God is there,
and love fills every breast;
when one their wish, and one their prayer,
and one their heavenly rest.

Happy the home where Jesus'' name
is sweet to every ear;
where children early speak his fame,
and parents hold him dear.

Happy the home where prayer is heard,
and praise is wont to rise;
where parents love the sacred Word
and all its wisdom prize.

Lord, let us in our homes agree
this blessed peace to gain;
unite our hearts in love to thee,
and love to all will reign.'),
(656, 'O perfect Love, all human thought transcending,
lowly we kneel in prayer before thy throne,
that theirs may be the love which knows no ending,
whom thou forevermore dost join in one.

O perfect Life, be thou their full assurance
of tender charity and steadfast faith,
of patient hope and quiet, brave endurance,
with childlike trust that fears nor pain nor death.

Grant them the joy which brightens earthly sorrow;
grant them the peace which calms all earthly strife,
and to life''s day the glorious unknown morrow
that dawns upon eternal love and life.'),
(657, 'O God from whom mankind derives its name;
Whose covenant of grace remains the same,
Be with these two who now before You wait;
Enlarge the love they come to consecrate.

May through their union other lives be blessed;
Their door be wide to stranger and to guest,
Give them the understanding that is kind,
Grant them the blessing of an open mind.

Preserve their days from inwardness of hear;
To each the gift of truthful speech impart.
Their bond be strong against all strain and strife
Amid the changes of this earthly life.

From stage to stage on life''s unfolding way
Bring to their mind the vows they make this day,
Your Spirit be their Guide in every move,
Their faith in Christ the basis of their love.'),
(658, 'Heav''nly Father, hear our prayer
As we bow before You:
Bless them in the life they share,
Humble we implore You.
Be their guide in all endeavors,
Be their hope that nothing severs;
Constant source of love divine,
Let Your love within them shine!

As they pledge their love this day
Here before Your altar,
May their hearts,, upon You stayed,
Never fail or falter.
Be their comfort in all sorrow;
Be their reason for tomorrow.
Grant them strength to live each hour
Trusting solely in Your pow''r.

Blest Creator, Lord of life,
Hear our glad thanksgiving.
Husband You have joined to wife
For their earthly living.
Justified by Jesus'' merit,
Life eternal they inherit.
When their days on earth have passed,
Take them to Your home at last!'),
(659, 'May the grace of Christ our Savior
And the Father''s boundless love,
With the Holy Spirit''s favor,
Rest upon them from above.

Thus may they abide in union
With each other and the Lord,
And possess, in sweet communion,
Joys which earth cannot afford.'),
(660, 'Glory be to the Father,
and to the Son,
and to the Holy Ghost;
As it was in the beginning,
is now, and ever shall be,
world without end.
Amen, Amen.'),
(661, 'Holy, holy, holy, Holy is the Lord!
Holy, holy, holy, Holy is our God!
He who always liveth, Evermore the same
Heav''n and earth He ruleth, Come and praise His name!

Holy, holy, holy, Holy is the Lord!
Holy, holy, holy, Holy is our God!
Glorious adn beloved Is the One adored!
Holy, holy, holy, Holy is the Lord.'),
(662, 'Let all mortal flesh keep silence,
And with fear and trembling stand;
Ponder nothing earthly-minded,
For with blessing in his hand,
Christ our God to earth descendeth,
Our full homage to demand. Amen.'),
(663, 'A-men, A---men.

A-----men.

A---men.

A---men, (A-men.)

A-----men.

A-men, A-men, A---men.'),
(664, 'A-men,
A-men,
A---men,
A-----men,
A-----men,
A-----men,
A-men.'),
(665, 'All things come of thee, O Lord;
and of thine own have we given thee.
Amen.'),
(666, 'Cast thy burden upon the Lord,
And He shall sustain thee;
He never will suffer the righteous to fall;
He is at thy right hand.
Thy mercy, Lord, is great, and far above the heavens;
Let none be made ashamed, that wait upon Thee.'),
(667, 'Lord, bless Thy word to every heart
In this Thy house today,
And help us each as now we part,
Its precepts to obey.
Amen
Amen'),
(668, 'O Thou who hearest every heartfelt prayer,
With Thy rich grace, Lord, all our hearts prepare;
Thou art our life, Thou art our love and light,
O let this Sabbath hour with Him be bright. Amen.'),
(669, 'The Lord bless you and keep you,
the Lord life His countenance upon you,
and give you peace;
the Lord make His face to shine upon you,
and be gracious unto you,
be gracious,
the Lord be gracious unto you.
Amen.'),
(670, 'We give Thee but Thine own,
What-e''er the gift may be;
All that we have is Thine alone,
A trust, O Lord, from Thee.'),
(671, 'Now, dear Lord, as we pray,
take our hearts and minds far away
from the press of the world all around
to your throne where grace does abound.
May our lives be transformed by Your love,
may our souls be refreshed from above.
At this moment, let people everywhere
join us now as we come to You in prayer.'),
(672, 'Spirit of the living God,
Fall afresh on me!
Spirit of the living God,
Fall afresh on me!
Break me, melt me, mold me, fill me!
Spirit of the living God,
Fall afresh on me!'),
(673, 'May God be with you Till we meet again,
May God be with you, Keep you safe till then;
And may His blessings Be within your heart,
May God be with you While we''re apart,
May God be with you.

May God be with you, Watch you from above,
May God protect you in His tender love;
And with the dawning Of each bright, new day,
May God be with you, To guide your way,
May God be with you.'),
(674, 'Shalom, good friends,
shalom, good friends,
shalom, shalom.
Till we meet again,
till we meet again,
shalom, shalom.'),
(675, 'May the Lord bless you and keep you
both now and evermore.
Amen, Amen.'),
(676, 'Thy Word is a lantern unto my feet,
And a light unto my path.'),
(677, 'Heavenly Father, to Thee we pray,
On the holy Sabbath day;
Through Thy Word Thy will make known;
May each heart become Thy throne,
Let Thy living water flow
That we Thy boundless love may know.
Amen.'),
(678, 'God be in my head, and in my understanding;
God be in mine eyes, and in my looking;
God be in my mouth, and in my speaking;
God be in my heart, and in my thinking;
God be at mine end, and at my departing.'),
(679, 'God be in my head,
And in my thinking.
god be in my eyes,
And in my looking.
God be in my mouth
And in my speaking.
Oh, God be in my hear,
And in my understanding.'),
(680, 'Holy Spirit, hear us;
Help us while we sing;
Breath into the music
Of the praise we bring.

Holy Spirit, prompt us
When we kneel to pray;
Nearer come, and teach us
What we ought to say.

Holy Spirit, shine Thou
On the Book we read;
Gild it''s holy pages
With the light we need.'),
(681, 'This is the day the Lord hath made;
he calls the hours his own.
Let heaven rejoice, let earth be glad,
and praise surround the throne.'),
(682, 'As You have promised, Lord, today,
You are letting Your servant go away in peace.
May eyes have seen You in broad daylight
before all nations, planning salvation.
Light of revelation for the nations,
and glory of Your people Israel.'),
(683, 'Jesus, stand among us
In Thy risen power;
Let this time of worship
Be a hallowed hour.

Breathe the Holy Spirit
Into every heart;
Bid the fears and sorrows
From each soul depart.

Thus with quickened footsteps
We pursue our way,
Watching for the dawning
Of eternal day.'),
(684, 'Hear Our Prayer, O Lord,
Hear our prayer, O Lord;
Incline Thine ear to us,
And grant us Thy peace.
Amen.'),
(685, 'Cause me to hear Thy loving kindness in the morning,
for in Thee do I trust.
Cause me to know they way where-in I shall walk
for I lift up my soul to Thee.
Amen'),
(686, 'Bless thou the gifts our hands have brought;
bless thou the work our hearts have planned.
Ours is the faith, the will, the thought;
the rest, O God, is in thy hand.
Amen.'),
(687, 'The Lord is in HIs holy temple,
The Lord is in His holy temple,
Let all the earth be silent
be silent before Him.'),
(688, 'Surely, surely the Lord has been here,
Surely angels still linger near;
I hear music soft on my ear,
I feel His Spirit,
I have no fear.'),
(689, 'Day by day, Dear Lord, of Thee three things I pray:
To see Thee more clearly, Love Thee more dearly,
Follow Thee more nearly, Day by day.'),
(690, 'Dismiss us, Lord, with blessing, we pray;
As from Thy worship we go our ways;
Guide in life''s conflicts, all through the day;
Save in Thy kingdom, Thine be the praise.
Amen.'),
(691, 'Lead me, Lord, lead me in thy righteousness;
make thy way plain before my face.
For it is thou, Lord, thou, Lord only,
that makest me dwell in safety.'),
(692, 'The Lord is in His holy temple,
The Lord is in His holy temple,
Let all the earth keep silence,
Let all the earth keep silence, before Him,
Keep silence, keep silence, before Him.
Amen.'),
(693, 'Almighty Father, hear our prayer,
and bless all souls that wait before Thee.
Amen.'),
(694, 'Praise God, from Whom all blessings flow;
Praise Him, all creatures here below;
Praise Him above, ye heavenly host;
Praise Father, Son, and Holy Ghost.'),
(695, 'Praise God, from Whom all blessings flow;
Praise Him, all creatures here below;
Praise Him above, ye heavenly host;
Praise Father, Son, and Holy Ghost.')
) as v(number, lyrics) where h.number = v.number;
