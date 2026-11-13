// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { jwtVerify, createRemoteJWKSet } from "jose";

// src/data/defaultDgnbMatrix.ts
var DEFAULT_DGNB_ENV12_MATRIX = [
  {
    id: "dgnb-z1",
    nr: "1",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Beschichtungen auf nicht mineralischen Untergr\xFCnden: Metalle, Holz, Kunststoffe",
    anwendungsbereich: "Gemeint sind dekorative fl\xFCssige Beschichtungsstoffe: Lacke/ Lasuren mit Grundbeschichtungen. Ausgenommen sind Effektbeschichtungen (z. B. Metalliclacke)",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen oder Gehalt",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG",
    qs1: "< 300 g/l - Kategorie D nach RL 2004/42/EG",
    qs2: "< 130 g/l - Kategorie D nach RL 2004/42/EG",
    qs3: "< 100 g/l",
    qs4: "DE-UZ 12a (Bei werkseitiger Beschichtung gilt alternativ: VOC < 100 g/l)",
    artDokumentation: "TM und/oder SDB und/oder Herstellererkl\xE4rung und/oder Pr\xFCfzertifikat (Gleichwertigkeit: DE-UZ 12a)",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte (Hinweis: werkseitige Beschichtungen)",
    qngRefNr: "6.1",
    bnbRefNr: "3a"
  },
  {
    id: "dgnb-z2",
    nr: "2",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Beschichtungen auf \xFCberwiegend mineralischen Untergr\xFCnden im Innenraum sowie auf Tapeten, Vliesen, Gipskartonplatten etc.",
    anwendungsbereich: "Gemeint sind dekorative Farben, Grundierungen, dekorative Spachtelmassen (inkl. QSpachtel) sowie Tiefengrund, Bodenbeschichtungen ohne spezielle Best\xE4ndigkeitsanforderungen, Betonlasuren.",
    betrachteteStoffe: "VOC / SVOC / Konservierungsstoffe",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG",
    qs1: "Gem\xE4\xDF Anforderungen f\xFCr wasserverd\xFCnnbare (Wb) Produkte gem\xE4\xDF aktueller Decopaint-RL (Anhang II)",
    qs2: "< 30 g/l",
    qs3: "l\xF6semittelfrei und weichmacherfrei und konservierungsmittelfrei nach VdL-RL01 oder DE-UZ 102",
    qs4: "l\xF6semittelfrei und weichmacherfrei und konservierungsmittelfrei nach VdL-RL01 oder DE-UZ 102",
    artDokumentation: "TM und/oder SDB und/oder Herstellererkl\xE4rung und/oder Pr\xFCfzertifikat",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte. F\xFCr max. 5 % der BGF(R) nach DIN 277 ist keine Dokumentation erforderlich.",
    qngRefNr: "5.5",
    bnbRefNr: "5"
  },
  {
    id: "dgnb-z3",
    nr: "3",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Beschichtungen auf \xFCberwiegend mineralischen Untergr\xFCnden im Innenraum wie Beton, Mauerwerk, M\xF6rtel und Spachtel (z. B. Betonspachtel)",
    anwendungsbereich: "Gemeint sind staubbindende Beschichtungen, Grundbeschichtungen z.B. Betonkontakt, Aufbrennsperre. Nicht betrachtet: OS-Systeme & Tiefgaragen.",
    betrachteteStoffe: "VOC",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG",
    qs1: "< 30 g/l",
    qs2: "< 30 g/l",
    qs3: "< 10 g/l",
    qs4: "< 5 g/l",
    artDokumentation: "TM und/oder SDB und/oder Herstellererkl\xE4rung und/oder Pr\xFCfzertifikat",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte. F\xFCr max. 5 % der BGF(R) nach DIN 277 ist keine Dokumentation erforderlich.",
    qngRefNr: "5.3",
    bnbRefNr: "4"
  },
  {
    id: "dgnb-z4",
    nr: "4",
    kategorie: "Wand- und Deckenbekleidungen",
    bauteil: "Wand- und Deckenbekleidungen (Tapetenkleber)",
    anwendungsbereich: "Alle Klebstoffe f\xFCr Papiertapeten, Raufaser, Vliestapeten und Wandbekleidungen",
    betrachteteStoffe: "VOC",
    bezugsnorm: "VdL-Richtlinie 01",
    qs1: "Pulverprodukte oder l\xF6semittelfreie Dispersionskleber",
    qs2: "Pulverprodukte oder l\xF6semittelfreie Dispersionskleber",
    qs3: "Pulverprodukte oder l\xF6semittelfreie Dispersionskleber",
    qs4: "Pulverprodukte oder l\xF6semittelfrei und weichmacherfrei nach VdL-RL01",
    artDokumentation: "TM und/oder SDB",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "4.4",
    bnbRefNr: "12"
  },
  {
    id: "dgnb-z5",
    nr: "5",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Beschichtungsstoffe f\xFCr mineralische Oberfl\xE4chen im Au\xDFenbereich (Beton, Mauerwerk, Putze, WDVS, Fassadentapeten)",
    anwendungsbereich: "Ber\xFCcksichtigt werden zur Zeit dekorative Farben und Dispersionsd\xE4mmstoffkleber",
    betrachteteStoffe: "VOC, Biozide",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG, 528/2012/EG (Biozidverordnung)",
    qs1: "< 40 g/l",
    qs2: "< 40 g/l",
    qs3: "< 40 g/l",
    qs4: "< 40 g/l und Notwendigkeit des Biozideinsatzes begr\xFCnden unter Einbeziehung der UBA Merkbl\xE4tter",
    artDokumentation: "TM und/oder SDB und/oder Herstellererkl\xE4rung und/oder UBA-Begr\xFCndung Biozideinsatz",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "5.2",
    bnbRefNr: "6a"
  },
  {
    id: "dgnb-z5b",
    nr: "5b",
    kategorie: "Dachbaustoffe",
    bauteil: "Biozideinsatz bei Betondachsteinen",
    anwendungsbereich: "Betondachsteine und bewitterte Eindeckungen",
    betrachteteStoffe: "Filmschutz Biozid",
    bezugsnorm: "528/2012/EG (Biozidverordnung)",
    qs1: "Filmschutz mit verkapselten Wirkstoffen",
    qs2: "Filmschutz mit verkapselten Wirkstoffen",
    qs3: "Kein Biozideinsatz. Schutz durch konstruktive Ma\xDFnahmen (z.B. Verhinderung der Wasserspeicherung)",
    qs4: "Kein Biozideinsatz. Schutz durch konstruktive Ma\xDFnahmen (z.B. Verhinderung der Wasserspeicherung)",
    artDokumentation: "Herstellererkl\xE4rung",
    geltungsbereich: "Betondachsteine",
    qngRefNr: "5.1",
    bnbRefNr: "35"
  },
  {
    id: "dgnb-z6",
    nr: "6",
    kategorie: "Bodenbel\xE4ge",
    bauteil: "Bodenbel\xE4ge - Textile Bodenbel\xE4ge",
    anwendungsbereich: "Teppichb\xF6den, Nadelvlies, Teppichfliesen",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen und Gehalt an gef\xE4hrlichen Stoffen",
    bezugsnorm: "GUT, RAL-UZ 128",
    qs1: "GUT-G\xFCtesiegel oder DE-UZ 128",
    qs2: "GUT-G\xFCtesiegel oder DE-UZ 128",
    qs3: "GUT-G\xFCtesiegel oder DE-UZ 128",
    qs4: "GUT-G\xFCtesiegel oder DE-UZ 128",
    artDokumentation: "TM und/oder Umweltzeichen (Blauer Engel DE-UZ 128 / GUT)",
    geltungsbereich: "Alle Bodenbel\xE4ge",
    qngRefNr: "2.1",
    bnbRefNr: "1"
  },
  {
    id: "dgnb-z7",
    nr: "7",
    kategorie: "Bodenbel\xE4ge",
    bauteil: "Bodenbel\xE4ge - Elastische Bodenbel\xE4ge (PVC, Linoleum, Kork, Gummi/Kautschuk)",
    anwendungsbereich: "Homogene und heterogene elastische Bel\xE4ge im Innenraum",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen, Chlorparaffine (SCCPs+MCCPs+LCCPs), SVHC",
    bezugsnorm: "AgBB Schema, DE-UZ 120",
    qs1: "Emissionsnachweis (AgBB oder hochwertiger)",
    qs2: "Emissionsnachweis (AgBB) und Chlorparaffine (SCCPs + MCCPs + LCCPs) < 0,1 %",
    qs3: "Emissionsnachweis (AgBB), Chlorparaffine < 0,1 % und SVHC \u2264 0,1 %",
    qs4: "DE-UZ 120 (Blauer Engel f\xFCr elastische Bodenbel\xE4ge)",
    artDokumentation: "TM und/oder Herstellererkl\xE4rung und Emissionsnachweis EN ISO 16000-9 / EN 16516 / DE-UZ 120",
    geltungsbereich: "Alle Bodenbel\xE4ge",
    qngRefNr: "2.2",
    bnbRefNr: "2a"
  },
  {
    id: "dgnb-z47c",
    nr: "47c",
    kategorie: "Bodenbel\xE4ge",
    bauteil: "Bodenbel\xE4ge - Mehrschichtparkett, Laminatb\xF6den, Furnierte Bodenbel\xE4ge, MMF-B\xF6den",
    anwendungsbereich: "Parkett-, Holzwerkstoff-, Laminat- und MMF-Bodenbel\xE4ge",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen und Gehalt an gef\xE4hrlichen Stoffen",
    bezugsnorm: "AgBB Schema, DE-UZ 176",
    qs1: "Emissionsnachweis (AgBB oder hochwertiger / E1)",
    qs2: "Emissionsnachweis (AgBB oder hochwertiger)",
    qs3: "Emissionsnachweis (AgBB oder hochwertiger)",
    qs4: "Emission nach 28. Tg \u2264 DE-UZ 176 und zus\xE4tzlich bei MMF B\xF6den ohne Einsatz von PVC als konstitutionellen Bestandteil",
    artDokumentation: "TM und/oder Herstellererkl\xE4rung und Emissionsnachweis EN ISO 16000-9 / EN 16516 / DE-UZ 176",
    geltungsbereich: "Alle Bodenbel\xE4ge",
    qngRefNr: "2.3",
    bnbRefNr: "2b"
  },
  {
    id: "dgnb-z8",
    nr: "8",
    kategorie: "Klebstoffe und Dichtstoffe",
    bauteil: "Grundierungen, Vorstriche, Spachtelmassen und Klebstoffe unter Wand- und Bodenbel\xE4gen",
    anwendungsbereich: "Alle Verlegewerkstoffe, Hilfsstoffe zur Belegung von Oberfl\xE4chen (Fliesen, Teppich, Parkett, Elastische Bel\xE4ge - ausgenommen Tapeten)",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen und Gehalt an gef\xE4hrlichen Stoffen",
    bezugsnorm: "GEV-EMICODE, GISCODE und DE-UZ 113",
    qs1: "GISCODE D1, ZP1, CP1, CP2, CP3, RU 0,5, RU 1, RE05, RE10, RE20, RE30 oder RS10",
    qs2: "GISCODE D1/ZP1/CP1-3/RU0,5-1/RE05-30/RS10 und EMICODE EC1PLUS oder DE-UZ 113",
    qs3: "GISCODE D1/ZP1/CP1-3/RU0,5-1/RE05-30/RS10 und EMICODE EC1PLUS oder DE-UZ 113",
    qs4: "GISCODE D1/ZP1/CP1-3/RU0,5-1/RE05-30/RS10 und EMICODE EC1PLUS oder DE-UZ 113",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung und/oder Herstellererkl\xE4rung / EMICODE Lizenz",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "3.1",
    bnbRefNr: "10b"
  },
  {
    id: "dgnb-z9",
    nr: "9",
    kategorie: "Klebstoffe und Dichtstoffe",
    bauteil: "Sperranstriche, Estrichharze, Abdichtungen unter Fliesen",
    anwendungsbereich: "Verlegewerkstoffe, Feuchtraumabdichtungen unter Fliesen, Estrichreparaturharze",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen und Gehalt an gef\xE4hrlichen Stoffen",
    bezugsnorm: "GEV-EMICODE, GISCODE",
    qs1: "GISCODE D1, ZP1, RE05, RE10, RE20, RE30, RU 0,5 oder RU 1",
    qs2: "GISCODE D1, ZP1, RE05, RE10, RE20, RE30, RU 0,5 oder RU 1",
    qs3: "GISCODE D1, ZP1, RE05, RE10, RE20, RE30, RU 0,5 oder RU 1 und EMICODE EC1 oder EC1PLUS",
    qs4: "GISCODE D1, ZP1, RE05, RE10, RE20, RE30, RU 0,5 oder RU 1 und EMICODE EC1 oder EC1PLUS",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung und/oder Pr\xFCfzertifikat",
    geltungsbereich: "Alle relevanten Bauteile. F\xFCr max. 5 % der BGF(R) ist keine Dokumentation erforderlich.",
    qngRefNr: "3.3",
    bnbRefNr: "11"
  },
  {
    id: "dgnb-z10",
    nr: "10",
    kategorie: "Bauhilfsstoffe",
    bauteil: "Naturstein- und Betonwerksteinbodenbel\xE4ge und Terrazzo",
    anwendungsbereich: "Nicht filmbildende Impr\xE4gnierungen im Innenbereich (z. B. Natursteinimpr\xE4gnierungen, Sandsteinverfestiger)",
    betrachteteStoffe: "VOC",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG",
    qs1: "Aromatenfrei (GH10)",
    qs2: "Aromatenfrei (GH10)",
    qs3: "Aromatenfrei (GH10)",
    qs4: "L\xF6semittelgehalt < 5 % und Keine kennzeichnungspflichtigen Stoffe",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "5.11",
    bnbRefNr: "7"
  },
  {
    id: "dgnb-z11",
    nr: "11",
    kategorie: "Klebstoffe und Dichtstoffe",
    bauteil: "Verklebungen und Abdichtungen im Innenraum (nicht Glasbau/Fassade/Brandschutz)",
    anwendungsbereich: "Dichtungsmassen, Dichtstoffe, Klebstoffe f\xFCr punkt- und linienf\xF6rmige Verklebungen: Fugen, Sockelleisten, T\xFCrschienen, St\xFCtzenkleber, L\xFCftungskan\xE4le (Acrylate, Silikone, PU, SMP)",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen und Gehalt an Oximen",
    bezugsnorm: "GISCODE, EMICODE",
    qs1: "GISCODE PU10, PU20, RS10, DA20, DSE20, DSA20, DSO20, DH20 oder DSC20",
    qs2: "GISCODE PU10, PU20, RS10, DA20, DSE20, DSA20, DSO20, DH20 oder DSC20",
    qs3: "GISCODE PU10/PU20/RS10/DA20/DSE20/DSA20/DSO20/DH20/DSC20 und EMICODE EC1PLUS",
    qs4: "GISCODE PU10/PU20/RS10/DA20/DSE20/DSA20/DSO20/DH20/DSC20 und EMICODE EC1PLUS",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung und/oder EMICODE-Nachweis",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "4.1",
    bnbRefNr: "8"
  },
  {
    id: "dgnb-z13",
    nr: "13",
    kategorie: "Klebstoffe und Dichtstoffe",
    bauteil: "Montagekleb- und Dichtstoffe an der Fassade, Fenstern und Au\xDFent\xFCren",
    anwendungsbereich: "Klebstoff f\xFCr die Herstellung der Luftdichtheit an der Fassade innen und au\xDFen: PU, PU-Hybrid, MS-Polymer, SMP, Acrylat, Silikon",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen und Chlorparaffine",
    bezugsnorm: "Chlorparaffine / EMICODE",
    qs1: "Chlorparaffine (SCCPs + MCCPs + LCCPs) < 0,1 % und EMICODE EC1PLUS oder VOC < 1 %",
    qs2: "Chlorparaffine (SCCPs + MCCPs + LCCPs) < 0,1 % und EMICODE EC1PLUS oder VOC < 1 %",
    qs3: "Chlorparaffine (SCCPs + MCCPs + LCCPs) < 0,1 % und EMICODE EC1PLUS oder VOC < 1 %",
    qs4: "Chlorparaffine (SCCPs + MCCPs + LCCPs) < 0,1 % und EMICODE EC1PLUS oder VOC < 1 %",
    artDokumentation: "TM und/oder SDB und/oder Herstellererkl\xE4rung und/oder Pr\xFCfzertifikat",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "4.3",
    bnbRefNr: "9"
  },
  {
    id: "dgnb-z14",
    nr: "14",
    kategorie: "Bauhilfsstoffe",
    bauteil: "Betontrennmittel",
    anwendungsbereich: "Schal\xF6le und Trennmittel beim Betonieren",
    betrachteteStoffe: "Gefahrstoffe, biologische Abbaubarkeit, VOC",
    bezugsnorm: "GISCODE, VOC VO 2004/24/EG DECOPAINT",
    qs1: "GISCODE BTM 01, BTM 05, BTM 10, BTM 15, BTM 20 oder BTM30",
    qs2: "GISCODE BTM 01, BTM 05, BTM 10, BTM 15 oder BTM20 und VOC < 3%",
    qs3: "GISCODE BTM 01, BTM 05, BTM 10 oder BTM15 und inh\xE4rent biologisch abbaubar nach OECD 302 und VOC < 1%",
    qs4: "GISCODE BTM 01, BTM 05 oder BTM 10 und leicht biologisch abbaubar nach OECD 301 und VOC < 1%",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "5.12",
    bnbRefNr: "43"
  },
  {
    id: "dgnb-z15",
    nr: "15",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Tragende und nicht tragende Metallbauteile im Innenraum mit > 50 m\xB2 Oberfl\xE4che",
    anwendungsbereich: "Brandschutzbeschichtung f\xFCr Metallbauteile im Rahmen einer bauaufsichtlichen Zulassung oder CE-Kennzeichnung",
    betrachteteStoffe: "VOC, Emissionen und Halogene",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG, ISO 11890-2, DIBt-Grunds\xE4tze",
    qs1: "Emissionsbewertetes Bauprodukt nach DIBt-Grunds\xE4tzen f\xFCr reactive Brandschutzsysteme oder abZ",
    qs2: "Emissionsbewertetes Bauprodukt (...) und Halogenfreies Produkt und VOC < 50 g/l",
    qs3: "Emissionsbewertetes Bauprodukt (...) und Halogenfreies Produkt und VOC < 25 g/l",
    qs4: "Emissionsbewertetes Bauprodukt (...) und Halogenfreies Produkt und VOC < 5 g/l",
    artDokumentation: "abZ / TM / SDB / Pr\xFCfzertifikat / AgBB-Nachweis",
    geltungsbereich: "Werk und Baustelle f\xFCr > 50 m\xB2 beschichteter Oberfl\xE4che",
    qngRefNr: "7.5",
    bnbRefNr: "44"
  },
  {
    id: "dgnb-z16",
    nr: "16",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Tragende Metallbauteile (Wandst\xE4rke > 3 mm) mit > 500 m\xB2 Oberfl\xE4che im Geb\xE4ude",
    anwendungsbereich: "Korrosionsschutzbeschichtungen f\xFCr innenliegende Bauteile (max. Korrosivit\xE4tskategorie C2 hoch)",
    betrachteteStoffe: "VOC",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG",
    qs1: "< 300 g/l",
    qs2: "Wasserverd\xFCnnbares Produkt < 140 g/l (Kat. A/i oder A/j nach Decopaint-Richtlinie)",
    qs3: "Wasserverd\xFCnnbares Produkt < 140 g/l (Kat. A/i oder A/j nach Decopaint-Richtlinie)",
    qs4: "Wasserverd\xFCnnbares Produkt < 100 g/l oder Einsatz eines C3\u2013Beschichtungssystems der QS4",
    artDokumentation: "Herstellererkl\xE4rung",
    geltungsbereich: "Werk und Baustelle f\xFCr > 500 m\xB2 beschichteter Oberfl\xE4che im Geb\xE4ude",
    qngRefNr: "7.1",
    bnbRefNr: "13"
  },
  {
    id: "dgnb-z17",
    nr: "17",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Tragende Metallbauteile (Wandst\xE4rke > 3 mm) mit > 500 m\xB2 Oberfl\xE4che (Korrosionsschutz C3 hoch)",
    anwendungsbereich: "Korrosionsschutzbeschichtungen f\xFCr Bauteile (max. Korrosivit\xE4tskategorie C3 hoch)",
    betrachteteStoffe: "VOC",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG",
    qs1: "Beschichtungssystem mit VOC < 120 g/m\xB2",
    qs2: "Beschichtungssystem mit VOC < 90 g/m\xB2",
    qs3: "Beschichtungssystem mit VOC < 60 g/m\xB2",
    qs4: "Beschichtungssystem mit VOC < 30 g/m\xB2 oder Einsatz ab C4",
    artDokumentation: "Herstellererkl\xE4rung",
    geltungsbereich: "Werk und Baustelle f\xFCr > 500 m\xB2 beschichteter Oberfl\xE4che",
    qngRefNr: "7.2",
    bnbRefNr: "14"
  },
  {
    id: "dgnb-z18",
    nr: "18",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Tragende Metallbauteile (Wandst\xE4rke > 3 mm) mit > 500 m\xB2 Oberfl\xE4che (Korrosionsschutz > C3)",
    anwendungsbereich: "Korrosionsschutzbeschichtungen f\xFCr Bauteile (Korrosivit\xE4tskategorie gr\xF6\xDFer C3)",
    betrachteteStoffe: "VOC",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG",
    qs1: "Beschichtungssystem mit VOC < 150 g/m\xB2",
    qs2: "Beschichtungssystem mit VOC < 120 g/m\xB2",
    qs3: "Beschichtungssystem mit VOC < 90 g/m\xB2",
    qs4: "Beschichtungssystem mit VOC < 60 g/m\xB2",
    artDokumentation: "Herstellererkl\xE4rung",
    geltungsbereich: "Werk und Baustelle f\xFCr > 500 m\xB2 beschichteter Oberfl\xE4che",
    qngRefNr: "7.3",
    bnbRefNr: "15"
  },
  {
    id: "dgnb-z19",
    nr: "19",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Nicht tragende Metallbauteile (Gel\xE4nder, Zargen, Stahlt\xFCren, Fassadenelemente, K\xE4lterohre)",
    anwendungsbereich: "Korrosionsschutzbeschichtungen und Effektbeschichtungen (z. B. Metalliceffektlacke)",
    betrachteteStoffe: "VOC",
    bezugsnorm: "VOC-Definition nach RL 2004/42/EG",
    qs1: "< 300 g/l",
    qs2: "< 300 g/l",
    qs3: "Wasserverd\xFCnnbare Produkte < 140 g/l (Ausnahme: Metallic < 300 g/l)",
    qs4: "Wasserverd\xFCnnbare Produkte < 140 g/l (Ausnahme: Metallic nur wasserverd\xFCnnbar)",
    artDokumentation: "TM und/oder SDB",
    geltungsbereich: "Werk und Baustelle f\xFCr > 10 m\xB2 beschichteter Bauteilfl\xE4che",
    qngRefNr: "7.4",
    bnbRefNr: "16"
  },
  {
    id: "dgnb-z20",
    nr: "20",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Reaktive PU-Produkte zur Beschichtung von mineralischen Oberfl\xE4chen an Boden, Decke und Wand",
    anwendungsbereich: "Versiegelungen, 2K-PU-Lacke, PU Bodenbeschichtungen - ausgenommen OS-Systeme f\xFCr Parkhaus",
    betrachteteStoffe: "VOC, Gefahrstoffe",
    bezugsnorm: "GISCODE",
    qs1: "GISCODE PU10 oder PU40",
    qs2: "GISCODE PU10 oder PU40",
    qs3: "GISCODE PU10 oder PU20 und Emissionsnachweis gem\xE4\xDF MVVTB als Einzelprodukt oder im System",
    qs4: "GISCODE PU10 oder PU40 und Emissionsnachweis gem\xE4\xDF MVVTB als Einzelprodukt oder im System",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Alle relevanten Bauteile. F\xFCr max. 5 % der BGF(R) keine Doku.",
    qngRefNr: "5.7",
    bnbRefNr: "17"
  },
  {
    id: "dgnb-z21",
    nr: "21",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Beschichtungen f\xFCr Holzoberfl\xE4chen: Parkett, Treppe und andere Holzfu\xDFb\xF6den",
    anwendungsbereich: "Produkte zur Oberfl\xE4chenbeschichtung (Lacke, Versiegelungen)",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen und Gehalt an gef\xE4hrlichen Stoffen",
    bezugsnorm: "GISCODE",
    qs1: "GISCODE W1, W2+, W3, W3+, W1/DD, W2/DD+, W3/DD oder W3/DD+",
    qs2: "GISCODE W1, W2+, W3, W3+, W1/DD, W2/DD+, W3/DD oder W3/DD+",
    qs3: "GISCODE W1, W2+, W1/DD oder W2/DD+ und EMICODE EC1PLUS",
    qs4: "GISCODE W1, W2+, W1/DD oder W2/DD+ und EMICODE EC1PLUS",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung und/oder Pr\xFCfzertifikat",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "6.2",
    bnbRefNr: "3b"
  },
  {
    id: "dgnb-z22",
    nr: "22",
    kategorie: "Farben und Beschichtungen",
    bauteil: "PMMA- und PMMA-/Epoxyd-Beschichtungen f\xFCr Boden- und Wandfl\xE4chen mit speziellen Anforderungen",
    anwendungsbereich: "Industrieb\xF6den, Parkfl\xE4chen, Tiefgaragen und Fl\xFCssigkunststoffe zur Abdichtung",
    betrachteteStoffe: "VOC",
    bezugsnorm: "GISCODE",
    qs1: "-",
    qs2: "RMA10 oder RMA15",
    qs3: "RMA10 oder RMA15",
    qs4: "RMA10 oder RMA15",
    artDokumentation: "TM und/oder SDB",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "5.10",
    bnbRefNr: "20b"
  },
  {
    id: "dgnb-z23",
    nr: "23",
    kategorie: "Farben und Beschichtungen",
    bauteil: "EP-Produkte zur Beschichtung von mineralischen Oberfl\xE4chen an Boden, Decke und Wand",
    anwendungsbereich: "Versiegelungen, 2K-EP-Lacke, EP-Bodenbeschichtungen - ausgenommen OS-Systeme",
    betrachteteStoffe: "VOC, Gefahrstoffe",
    bezugsnorm: "GISCODE, MVVTB",
    qs1: "GISCODE RE05, RE10, RE20, RE30, RE40, RE50 oder RE55",
    qs2: 'GISCODE RE05, RE10, RE20, RE30 oder RE55/"total solid"',
    qs3: 'GISCODE RE05, RE10, RE20, RE30 oder RE55 "total solid" und Emissionsnachweis (AgBB)',
    qs4: "GISCODE RE05, RE10, RE20 oder RE30 und Emissionsnachweis (AgBB)",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung und/oder Pr\xFCfzertifikat",
    geltungsbereich: "Alle relevanten Bauteile. F\xFCr max. 5 % der BGF(R) keine Doku.",
    qngRefNr: "5.8",
    bnbRefNr: "19"
  },
  {
    id: "dgnb-z24",
    nr: "24",
    kategorie: "Farben und Beschichtungen",
    bauteil: "EP-/PU-Grundierungen und Beschichtungen f\xFCr Boden- und Wandfl\xE4chen (OS-Systeme)",
    anwendungsbereich: "Industrieb\xF6den, Parkfl\xE4chen und Tiefgaragen (Oberfl\xE4chenschutzsysteme wie OS 8, 10, 11 u.a.)",
    betrachteteStoffe: "Polyurethan und Epoxidharze",
    bezugsnorm: "GISCODE",
    qs1: "GISCODE PU10, PU20, PU40, PU60, RE05, RE10, RE20, RE30, RE40, RE50 oder RE55",
    qs2: "GISCODE PU10, PU20, PU40, PU60, RE05, RE10, RE20, RE30, RE40, RE50 oder RE55",
    qs3: "GISCODE PU10, PU40, PU60, RE05, RE10, RE20 oder RE30",
    qs4: "GISCODE PU10, PU40, PU60, RE05, RE10, RE20 oder RE30",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "5.9",
    bnbRefNr: "20a"
  },
  {
    id: "dgnb-z25",
    nr: "25",
    kategorie: "Dach und Abdichtung",
    bauteil: "Dachabdichtung, Bauwerksabdichtung gegen Erdreich/Wasser, Bitumendickbeschichtung",
    anwendungsbereich: "Kalt verarbeitbare Produkte zur Beschichtung (z. B. Vorstriche) und Hilfsstoffe (Kleber, Versiegelungen)",
    betrachteteStoffe: "Bitumen L\xF6semittel: Siedepunkt 135-250 \xB0C",
    bezugsnorm: "GISCODE",
    qs1: "GISCODE BBP10 oder BBP20",
    qs2: "GISCODE BBP10 oder BBP20",
    qs3: "GISCODE BBP10",
    qs4: "GISCODE BBP10",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "10.1",
    bnbRefNr: "21"
  },
  {
    id: "dgnb-z26",
    nr: "26",
    kategorie: "Dach und Abdichtung",
    bauteil: "Bitumin\xF6se Verbundabdichtungen beim Umkehrdach",
    anwendungsbereich: "Bitumenvoranstrich",
    betrachteteStoffe: "Bitumen",
    bezugsnorm: "GISCODE 7",
    qs1: "GISCODE BBP10, BBP20 oder BBP30",
    qs2: "GISCODE BBP10, BBP20 oder BBP30",
    qs3: "GISCODE BBP10, BBP20 oder BBP30",
    qs4: "GISCODE BBP10, BBP20 oder BBP30",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "10.2",
    bnbRefNr: "22"
  },
  {
    id: "dgnb-z27",
    nr: "27",
    kategorie: "Farben und Beschichtungen",
    bauteil: "Beschichtungen f\xFCr Holzoberfl\xE4chen: Parkett, Treppe und Vert\xE4felungen (\xD6le und Wachse)",
    anwendungsbereich: "\xD6le und Wachse zur Beschichtung von Holz",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen und Gehalt an gef\xE4hrlichen Stoffen",
    bezugsnorm: "GISCODE",
    qs1: "GISCODE \xD610, \xD610+, \xD610/DD+, \xD620, \xD620+, \xD640, \xD640+ oder \xD640/DD+",
    qs2: "GISCODE \xD610+, \xD610/DD+ oder \xD620+",
    qs3: "GISCODE \xD610+ oder \xD610/DD+ und Emicode EC1+",
    qs4: "GISCODE \xD610+ oder \xD610/DD+ und Emicode EC1+",
    artDokumentation: "TM und/oder SDB und/oder GISBAU-Einstufung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "6.5",
    bnbRefNr: "23"
  },
  {
    id: "dgnb-z28",
    nr: "28",
    kategorie: "Holz und Holzwerkstoffe",
    bauteil: "Tragende Holzbauteile innenliegend nebst Auskragungen nach au\xDFen",
    anwendungsbereich: "Chemischer Holzschutz nach DIN 68800-3 \u2013 Gebrauchsklassen GK0 bis GK2",
    betrachteteStoffe: "Holzschutzmittel (Produktart 8 nach 528/2012/EG)",
    bezugsnorm: "528/2012/EG (Biozidverordnung)",
    qs1: "GK 0: Holzschutz nur konstruktiv nach 68800-2, GK 1-2: verkehrsf\xE4hige Biozidprodukte",
    qs2: "Holzschutz nur konstruktiv nach 68800-2 oder nat\xFCrlich dauerhafte oder modifizierte H\xF6lzer (DIN 68800-1)",
    qs3: "Holzschutz nur konstruktiv nach 68800-2 oder nat\xFCrlich dauerhafte oder modifizierte H\xF6lzer (DIN 68800-1)",
    qs4: "Holzschutz nur konstruktiv nach 68800-2 oder nat\xFCrlich dauerhafte oder modifizierte H\xF6lzer (DIN 68800-1)",
    artDokumentation: "Planung, TM und/oder SDB und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "8.1",
    bnbRefNr: "24"
  },
  {
    id: "dgnb-z29",
    nr: "29",
    kategorie: "Holz und Holzwerkstoffe",
    bauteil: "Au\xDFenliegende tragende Holzbauteile",
    anwendungsbereich: "Chemischer Holzschutz nach DIN 68800-3 \u2013 Gebrauchsklassen GK3 bis GK4",
    betrachteteStoffe: "Holzschutzmittel (Produktart 8 nach 528/2012/EG)",
    bezugsnorm: "528/2012/EG (Biozidverordnung)",
    qs1: "GK 3 und 4: verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs2: "GK 3 und 4: verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs3: "GK 3 und 4: verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs4: "Holzschutz nur konstruktiv nach 68800-2 oder nat\xFCrlich dauerhafte oder modifizierte H\xF6lzer (DIN 68800-1)",
    artDokumentation: "Planung, TM und/oder SDB und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "8.2",
    bnbRefNr: "25"
  },
  {
    id: "dgnb-z30a",
    nr: "30a",
    kategorie: "Holz und Holzwerkstoffe",
    bauteil: "Masshaltige Holzbauteile: Au\xDFent\xFCren und Au\xDFenfenster",
    anwendungsbereich: "Chemische Impr\xE4gnierung nichttragender Bauteile",
    betrachteteStoffe: "Holzschutzmittel (Produktart 8 nach 528/2012/EG)",
    bezugsnorm: "528/2012/EG (Biozidverordnung)",
    qs1: "verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs2: "verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs3: "verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs4: "Holzschutz nur konstruktiv nach 68800-2 oder nat\xFCrlich dauerhafte oder modifizierte H\xF6lzer (DIN 68800-1)",
    artDokumentation: "TM und/oder SDB und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Alle relevanten Bauteile",
    qngRefNr: "8.3",
    bnbRefNr: "26"
  },
  {
    id: "dgnb-z30b",
    nr: "30b",
    kategorie: "Holz und Holzwerkstoffe",
    bauteil: "Nicht masshaltige Holzbauteile innen und au\xDFen (z. B. Fassade und Terrasse)",
    anwendungsbereich: "Chemische Impr\xE4gnierung nichttragender Bauteile",
    betrachteteStoffe: "Holzschutzmittel (Produktart 8 nach 528/2012/EG)",
    bezugsnorm: "528/2012/EG (Biozidverordnung)",
    qs1: "Innen: Kein chemischer Holzschutz, au\xDFen: verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs2: "Innen: Kein chemischer Holzschutz, au\xDFen: verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs3: "Innen: Kein chemischer Holzschutz, au\xDFen: verkehrsf\xE4hige Biozidprodukte nach 528/2012/EG",
    qs4: "Holzschutz nur konstruktiv nach 68800-2 oder nat\xFCrlich dauerhafte oder modifizierte H\xF6lzer (DIN 68800-1)",
    artDokumentation: "TM und/oder SDB und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Innen: Alle Bauteile. Au\xDFen: F\xFCr max. 5 % BGF(R) keine Doku.",
    qngRefNr: "8.3",
    bnbRefNr: "26"
  },
  {
    id: "dgnb-z31",
    nr: "31",
    kategorie: "Holz und Holzwerkstoffe",
    bauteil: "Filmkonservierte Produkte und mit Bioziden behandelte Waren (filmgesch\xFCtzte Holzlasuren)",
    anwendungsbereich: "Fassaden- und Innenlasuren mit Biozidkonservierung",
    betrachteteStoffe: "Biozide (Produktart 7 nach 528/2012/EG: Schutzmittel f\xFCr Baumaterialien)",
    bezugsnorm: "528/2012/EG (Biozidverordnung)",
    qs1: "Keine Verwendung von Bioziden im Innenraum (au\xDFer Topfkonservierung). Fenster: verkehrsf\xE4hige Biozide.",
    qs2: "Keine Verwendung von Bioziden im Innenraum (au\xDFer Topfkonservierung). Fenster: verkehrsf\xE4hige Biozide.",
    qs3: "Keine Verwendung von Bioziden im Innenraum (au\xDFer Topfkonservierung). Fenster: verkehrsf\xE4hige Biozide.",
    qs4: "Keine Verwendung von Bioziden im Innenraum (au\xDFer Topfkonservierung). Fenster: verkehrsf\xE4hige Biozide.",
    artDokumentation: "Herstellererkl\xE4rung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "8.3",
    bnbRefNr: "3a"
  },
  {
    id: "dgnb-z31b",
    nr: "31b",
    kategorie: "Dach und Abdichtung",
    bauteil: "Bahnenf\xF6rmige Abdichtungen (Wurzelschutzbahnen)",
    anwendungsbereich: "Abdichtungsbahnen bei Flachd\xE4chern und Gr\xFCnd\xE4chern",
    betrachteteStoffe: 'Methylchlorphenoxypropions\xE4ure (MCPP) "Mecoprop"',
    bezugsnorm: "Austrag nach DIN CEN/TS 16637-2:2014-11",
    qs1: "<= 1 mg/m\xB2 oder kein Einsatz von MCPP-Verbindungen. Bei Gr\xFCnd\xE4chern <= 47 mg/m\xB2",
    qs2: "<= 1 mg/m\xB2 oder kein Einsatz von MCPP-Verbindungen. Bei Gr\xFCnd\xE4chern <= 47 mg/m\xB2",
    qs3: "<= 1 mg/m\xB2 oder kein Einsatz von MCPP-Verbindungen. Bei Gr\xFCnd\xE4chern <= 47 mg/m\xB2",
    qs4: "<= 1 mg/m\xB2 oder kein Einsatz von MCPP-Verbindungen",
    artDokumentation: "Herstellererkl\xE4rung / DIBt Gutachten Nr. G-101-18-0008 f\xFCr Bitumendachbahnen",
    geltungsbereich: "Alle Abdichtungsbahnen",
    qngRefNr: "10.3",
    bnbRefNr: "37"
  },
  {
    id: "dgnb-z32",
    nr: "32",
    kategorie: "Metallbauteile",
    bauteil: "S\xE4mtliche Aluminium und Edelstahlbauteile der H\xFClle (> 5 m\xB2 Gesamtfl\xE4che)",
    anwendungsbereich: "Produkte zur Passivierung von Aluminium und Edelstahl (Fassadenprofile, Verkleidungen, Attikableche)",
    betrachteteStoffe: "Chrom-VI",
    bezugsnorm: "GefStoffV / REACH",
    qs1: "-",
    qs2: "-",
    qs3: "Chrom-VI-freie Passivierungsmittel",
    qs4: "Chrom-VI-freie Passivierungsmittel",
    artDokumentation: "Herstellererkl\xE4rung",
    geltungsbereich: "Alle relevanten H\xFCllbauteile > 5 m\xB2",
    qngRefNr: "11.3",
    bnbRefNr: "27"
  },
  {
    id: "dgnb-z33",
    nr: "33",
    kategorie: "Metallbauteile",
    bauteil: "Beschichtete Metallbauteile: Fassadenelemente, Au\xDFent\xFCren, Au\xDFenfenster",
    anwendungsbereich: "Grundierung und Endbeschichtung (Farben, Lacke, Pulverlacke). Feuerverzinkungen ausgenommen.",
    betrachteteStoffe: "Chrom-VI",
    bezugsnorm: "REACH Anhang XIV / SVHC",
    qs1: "Kein Einsatz von Chrom-VI-Verbindungen",
    qs2: "Kein Einsatz von Chrom-VI-Verbindungen",
    qs3: "Kein Einsatz von Chrom-VI-Verbindungen",
    qs4: "Kein Einsatz von Chrom-VI-Verbindungen",
    artDokumentation: "SDB und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Werksseitig beschichtete Bauteile mit beschichteter Fl\xE4che > 100 m\xB2",
    qngRefNr: "6.1",
    bnbRefNr: "16"
  },
  {
    id: "dgnb-z34",
    nr: "34",
    kategorie: "Dach und Abdichtung",
    bauteil: "Dacheindeckung, Dachrinnen (Kupfer)",
    anwendungsbereich: "Wasserf\xFChrende Bauteile an Dach und Regenwasserabf\xFChrung",
    betrachteteStoffe: "Kupfer",
    bezugsnorm: "UBA-Leitfaden 17/05",
    qs1: "-",
    qs2: "-",
    qs3: "Schwermetallfilter, falls Fl\xE4che > 10 % der projizierten Dachaufsicht",
    qs4: "Schwermetallfilter, falls Fl\xE4che > 10 % der projizierten Dachaufsicht",
    artDokumentation: "Planung und/oder Herstellererkl\xE4rung / UBA-Leitfaden",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "11.3",
    bnbRefNr: "30"
  },
  {
    id: "dgnb-z34.1",
    nr: "34.1",
    kategorie: "Dach und Abdichtung",
    bauteil: "Wasserf\xFChrende bzw. wasserableitende Bauteile an Dach und Entw\xE4sserung aus Titanzink",
    anwendungsbereich: "Zinkemissionen wasserf\xFChrender Bauteile aus Titanzink",
    betrachteteStoffe: "Zink",
    bezugsnorm: "RegenwasserCheck ZINK (www.zn-rate.com)",
    qs1: "-",
    qs2: "-",
    qs3: "Bei bewitterten Fl\xE4chen > 50 m\xB2: objektbezogener Nachweis. Bei negativem Ergebnis Emissionsminderungsma\xDFnahmen",
    qs4: "Bei allen bewitterten Fl\xE4chen: objektbezogener Nachweis. Bei negativem Ergebnis Emissionsminderungsma\xDFnahmen",
    artDokumentation: "Nachweis nach dem Berechnungsprogramm RegenwasserCheck ZINK",
    geltungsbereich: "Alle Titanzinkbauteile",
    qngRefNr: "11.3",
    bnbRefNr: "30"
  },
  {
    id: "dgnb-z34.2",
    nr: "34.2",
    kategorie: "Dach und Abdichtung",
    bauteil: "Wasserf\xFChrende oder mit Regenwasser benetzte Konstruktionen aus verzinktem Stahl",
    anwendungsbereich: "Bleiabtrag aus verzinktem Stahl (> 100 m\xB2)",
    betrachteteStoffe: "Blei",
    bezugsnorm: "Feuerverzinken von St\xFCckgut (Bleigehalt < 0,1 % im \xDCberzug)",
    qs1: "Verwendung von bleifreiem verzinktem Stahl (Bleigehalt < 0,1 %) oder Emissionsminderung",
    qs2: "Verwendung von bleifreiem verzinktem Stahl (Bleigehalt < 0,1 %) oder Emissionsminderung",
    qs3: "Verwendung von bleifreiem verzinktem Stahl (Bleigehalt < 0,1 %) oder Emissionsminderung",
    qs4: "Verwendung von bleifreiem verzinktem Stahl (Bleigehalt < 0,1 %) oder Emissionsminderung",
    artDokumentation: "Herstellererkl\xE4rung zum Bleigehalt des Zink\xFCberzugs (< 0,1 %) / Zinkbad (< 0,2 %)",
    geltungsbereich: "Verzinkter Stahl > 100 m\xB2",
    qngRefNr: "11.3",
    bnbRefNr: "30"
  },
  {
    id: "dgnb-z37",
    nr: "37",
    kategorie: "Geb\xE4udetechnik",
    bauteil: "K\xFChlanlagen / TGA / Splitger\xE4te (werkseitig)",
    anwendungsbereich: "K\xE4ltemittel in K\xE4lteanlagen, Klimager\xE4ten und W\xE4rmepumpen",
    betrachteteStoffe: "Halogenierte K\xE4ltemittel",
    bezugsnorm: "EU F-Gase-Verordnung 517/2014/EU",
    qs1: "Zus\xE4tzlicher Bewertungspunkt: Frei von halogenierten / teilhalogenierten K\xE4ltemitteln",
    qs2: "Zus\xE4tzlicher Bewertungspunkt: Frei von halogenierten / teilhalogenierten K\xE4ltemitteln",
    qs3: "Zus\xE4tzlicher Bewertungspunkt: Frei von halogenierten / teilhalogenierten K\xE4ltemitteln",
    qs4: "Frei von halogenierten / teilhalogenierten K\xE4ltemitteln",
    artDokumentation: "TGA-Planung und/oder Herstellererkl\xE4rung",
    geltungsbereich: "S\xE4mtliche K\xE4lte- und Klimatechnik",
    qngRefNr: "13.3",
    bnbRefNr: "34"
  },
  {
    id: "dgnb-z38",
    nr: "38",
    kategorie: "D\xE4mmstoffe",
    bauteil: "Montagesch\xE4ume (au\xDFer Verklebungen von D\xE4mmstoffen)",
    anwendungsbereich: "Ort- und Montagesch\xE4ume f\xFCr Au\xDFent\xFCren, Au\xDFenfenster, Perimeterd\xE4mmung, Kellerdecke, Flachdach, Innenausbau",
    betrachteteStoffe: "VVOC, VOC, SVOC, Halogenierte Treibmittel, Chlorparaffine, Weichmacher, Flammschutzmittel",
    bezugsnorm: "REACH, SVHC, EMICODE EC1PLUS",
    qs1: "EMICODE EC1PLUS, halogenierte Treibmittel < 0,1 %, Chlorparaffine < 0,1 %, TCEP < 0,1 %",
    qs2: "EMICODE EC1PLUS, halogenierte Treibmittel < 0,1 %, Chlorparaffine < 0,1 %, TCEP < 0,1 %",
    qs3: "EMICODE EC1PLUS, halogenierte Treibmittel < 0,1 %, Chlorparaffine < 0,1 %, TCEP < 0,1 %, weichmacherfrei, halogenfreie Flammschutzmittel",
    qs4: "EMICODE EC1PLUS, halogenierte Treibmittel < 0,1 %, Chlorparaffine < 0,1 %, TCEP < 0,1 %, weichmacherfrei, halogenfreie Flammschutzmittel",
    artDokumentation: "TM und/oder SDB und/oder Herstellererkl\xE4rungen und/oder EC1PLUS-Nachweis",
    geltungsbereich: "Alle relevanten Montagesch\xE4ume",
    qngRefNr: "12.5",
    bnbRefNr: "33"
  },
  {
    id: "dgnb-z39",
    nr: "39",
    kategorie: "D\xE4mmstoffe",
    bauteil: "Montagesch\xE4ume f\xFCr D\xE4mmstoffe (WDVS)",
    anwendungsbereich: "Montagesch\xE4ume f\xFCr die Verklebung von WDVS",
    betrachteteStoffe: "Halogenierte Treibmittel",
    bezugsnorm: "REACH, SVHC",
    qs1: "Keine Verwendung von Montagesch\xE4umen (Ausnahme: Fugen von WDVS-D\xE4mmplatten ohne halogenierte Treibmittel)",
    qs2: "Keine Verwendung von Montagesch\xE4umen (Ausnahme: Fugen von WDVS-D\xE4mmplatten ohne halogenierte Treibmittel)",
    qs3: "Keine Verwendung von Montagesch\xE4umen (Ausnahme: Fugen von WDVS-D\xE4mmplatten ohne halogenierte Treibmittel)",
    qs4: "Keine Verwendung von Montagesch\xE4umen (Ausnahme: Fugen von WDVS-D\xE4mmplatten ohne halogenierte Treibmittel)",
    artDokumentation: "Nachweis des mineralischen Klebers, Fugenschaum ohne halogenierte Treibmittel (TM/SDB)",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "12.5",
    bnbRefNr: "33"
  },
  {
    id: "dgnb-z40",
    nr: "40",
    kategorie: "D\xE4mmstoffe",
    bauteil: "Kunstschaum-D\xE4mmstoffe f\xFCr Geb\xE4ude und Haustechnik",
    anwendungsbereich: "XPS in Fassadenanwendungen, Resolplatten",
    betrachteteStoffe: "Halogenierte Treibmittel",
    bezugsnorm: "REACH",
    qs1: "Kein Einsatz von halogenierten Treibmitteln",
    qs2: "Kein Einsatz von halogenierten Treibmitteln",
    qs3: "Kein Einsatz von halogenierten Treibmitteln",
    qs4: "Kein Einsatz von halogenierten Treibmitteln",
    artDokumentation: "TM und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Alle f\xFCr GEG relevanten Bauteile und TGA-Hauptstr\xE4nge",
    qngRefNr: "12.1",
    bnbRefNr: "32a"
  },
  {
    id: "dgnb-z42",
    nr: "42",
    kategorie: "Bauhilfsstoffe",
    bauteil: "Flammhemmend ausger\xFCstete Bauprodukte (Gemische)",
    anwendungsbereich: "Technischer Brandschutz, Verklebungen/Abdichtungen Innen, PU-Montagekleber f\xFCr D\xE4mmstoffe, Brandschottspachteln, Kabelcoatings, Brandschutzsilikone",
    betrachteteStoffe: "Chlorparaffine (SCCPs + MCCPs + LCCPs) und SVHC",
    bezugsnorm: "Beschr\xE4nkung nach POP-VO und SVHC der REACH-Kandidatenliste sowie langkettige Chlorparaffine",
    qs1: "-",
    qs2: "Chlorparaffine (SCCPs + MCCPs + LCCPs) < 0,1 % und SVHC \u2264 0,1 %",
    qs3: "Chlorparaffine (SCCPs + MCCPs + LCCPs) < 0,1 % und SVHC \u2264 0,1 %",
    qs4: "Chlorparaffine (SCCPs + MCCPs + LCCPs) < 0,1 % und SVHC \u2264 0,1 %",
    artDokumentation: 'TM und/oder SDB gem\xE4\xDF 1907/2006/EG und Herstellererkl\xE4rung "Keine Chlorparaffine und keine SVHC > 0,1%"',
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "13.2",
    bnbRefNr: "44"
  },
  {
    id: "dgnb-z43",
    nr: "43",
    kategorie: "D\xE4mmstoffe",
    bauteil: "Flammhemmend ausger\xFCstete Bauprodukte (Erzeugnisse)",
    anwendungsbereich: "a) Haustechnikd\xE4mmstoffe, Wandbel\xE4ge (Glasfasertapete/Malervlies); b) PE-Dampfbremsfolien",
    betrachteteStoffe: "a) Chlorparaffine, PBB, PBDE, SVHC; b) Antimontrioxid",
    bezugsnorm: "POP-VO, REACH-Verordnung",
    qs1: "-",
    qs2: "a) Chlorparaffine < 0,1 %, PBB < 0,1 %, PBDE < 0,1 %, SVHC < 0,1 %; b) Antimontrioxid < 0,1 %",
    qs3: "a) Chlorparaffine < 0,1 %, PBB < 0,1 %, PBDE < 0,1 %, SVHC < 0,1 %; b) Antimontrioxid < 0,1 %",
    qs4: "a) Chlorparaffine < 0,1 %, PBB < 0,1 %, PBDE < 0,1 %, SVHC < 0,1 %; b) Antimontrioxid < 0,1 %",
    artDokumentation: "TM und/oder Herstellererkl\xE4rung",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "12.2",
    bnbRefNr: "45"
  },
  {
    id: "dgnb-z44",
    nr: "44",
    kategorie: "Kunststoffe",
    bauteil: "Erzeugnisse aus Kunststoffen (PVC)",
    anwendungsbereich: "QS3-4: Wandbel\xE4ge, Wand- & Deckenbekleidungen, Kabelummantelungen. QS4 zus\xE4tzlich: Kunststofffensterprofile, Lichtkuppelaufsatzkr\xE4nze, Kunststofft\xFCren",
    betrachteteStoffe: "SVHC der REACH-Kandidatenliste",
    bezugsnorm: "REACH-Verordnung / Anhang XIV",
    qs1: "-",
    qs2: "-",
    qs3: "SVHC \u2264 0,1 %",
    qs4: "Bauteile wie QS3 und zus\xE4tzlich f\xFCr Kunststofffensterprofile, Lichtkuppelaufsatzkr\xE4nze und Kunststofft\xFCren: SVHC \u2264 0,1 %",
    artDokumentation: 'TM und/oder Herstellererkl\xE4rung "Keine SVHC-Stoffe > 0,1%"',
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "11.1",
    bnbRefNr: "29"
  },
  {
    id: "dgnb-z45",
    nr: "45",
    kategorie: "D\xE4mmstoffe",
    bauteil: "Biozid und flammhemmend ausger\xFCstete Bauprodukte (Erzeugnisse) - Zellulosed\xE4mmstoffe",
    anwendungsbereich: "Zellulosed\xE4mmstoffe in Wand, Decke und Dach",
    betrachteteStoffe: "Borverbindungen als Rezepturbestandteil",
    bezugsnorm: "SVHC der REACH-Kandidatenliste",
    qs1: "-",
    qs2: "-",
    qs3: "Borverbindungen \u2264 0,1 %",
    qs4: "Borverbindungen \u2264 0,1 %",
    artDokumentation: 'TM und/oder Herstellererkl\xE4rung "Keine Borverbindungen > 0,1%"',
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "12.4",
    bnbRefNr: "46b"
  },
  {
    id: "dgnb-z46",
    nr: "46",
    kategorie: "Klebstoffe und Dichtstoffe",
    bauteil: "PU-Systemkleber",
    anwendungsbereich: "Konstruktive PU-Kleber f\xFCr Trockenestrich, Hohlboden, Trockenbauplatten",
    betrachteteStoffe: "L\xF6semittel",
    bezugsnorm: "REACH, GISCODE",
    qs1: "GISCODE RU0,5 oder RU1 (l\xF6semittelfrei)",
    qs2: "GISCODE RU0,5 oder RU1 (l\xF6semittelfrei)",
    qs3: "GISCODE RU0,5 oder RU1 (l\xF6semittelfrei)",
    qs4: "GISCODE RU0,5 oder RU1 (l\xF6semittelfrei)",
    artDokumentation: "TM + SDB",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "4.2",
    bnbRefNr: "8"
  },
  {
    id: "dgnb-z47",
    nr: "47",
    kategorie: "Holz und Holzwerkstoffe",
    bauteil: "Beschichtete und unbeschichtete Holzwerkstoffe: Spanplatten, Tischlerplatten, Furnierplatten, Faserplatten",
    anwendungsbereich: "Innent\xFCren aus Holzwerkstoffen, Raumakustikelemente, Raum-in-Raum-Systeme, Paneelverkleidungen, Doppel-/Hohlbodenplatten, WC-Trennw\xE4nde",
    betrachteteStoffe: "Formaldehyd Emissionen",
    bezugsnorm: "ChemVerbotsV, DIN EN 16516 oder DIN EN 717-1 (mit Faktor 2)",
    qs1: "Formaldehyd \u2264 0,10 ppm (entspricht 0,124 mg/m\xB3)",
    qs2: "Formaldehyd \u2264 0,10 ppm (entspricht 0,124 mg/m\xB3)",
    qs3: "Formaldehyd \u2264 0,10 ppm (entspricht 0,124 mg/m\xB3)",
    qs4: "DE-UZ 76 oder Formaldehyd \u2264 0,08 ppm (entspricht 0,103 mg/m\xB3)",
    artDokumentation: "Pr\xFCfnachweis gem\xE4\xDF DIN EN 16516 oder DIN EN 717-1",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "9.1",
    bnbRefNr: "41"
  },
  {
    id: "dgnb-z47d",
    nr: "47d",
    kategorie: "Holz und Holzwerkstoffe",
    bauteil: "Produkte aus Holzwerkstoffen (Deckenbekleidungen, Wandbekleidungen)",
    anwendungsbereich: "Deckenbekleidungen und Wandbekleidungen aus Holzwerkstoffen",
    betrachteteStoffe: "VVOC, VOC, SVOC Emissionen",
    bezugsnorm: "DIN EN 16516, AgBB-Schema",
    qs1: "Emissionsnachweis nach AgBB oder hochwertiger",
    qs2: "Emissionsnachweis nach AgBB oder hochwertiger",
    qs3: "Emission nach 28. Tg \u2264 DE-UZ 76",
    qs4: "Emission nach 28. Tg \u2264 DE-UZ 76",
    artDokumentation: "Pr\xFCfnachweis gem\xE4\xDF DIN EN 16516",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "9.2",
    bnbRefNr: "41"
  },
  {
    id: "dgnb-z48",
    nr: "48",
    kategorie: "Holz und Holzwerkstoffe",
    bauteil: "Holzbau und Fertigholzh\xE4user: Holzwerkstoffe im konstruktiven Holzbau",
    anwendungsbereich: "Aussteifende Holzplatten an Wand, Boden und Decke in Holzh\xE4usern / Holzbaukonstruktionen",
    betrachteteStoffe: "Formaldehyd Emissionen",
    bezugsnorm: "ChemVerbotsV, DIN EN 16516 oder DIN EN 717-1",
    qs1: "Formaldehyd \u2264 0,10 ppm (entspricht 0,124 mg/m\xB3)",
    qs2: "Formaldehyd \u2264 0,10 ppm (entspricht 0,124 mg/m\xB3)",
    qs3: "Formaldehyd \u2264 0,10 ppm (entspricht 0,124 mg/m\xB3)",
    qs4: "Formaldehyd \u2264 0,06 ppm (entspricht 0,072 mg/m\xB3) in Pr\xFCfkammer (entspricht QDF-Anforderungen)",
    artDokumentation: "Pr\xFCfnachweis gem\xE4\xDF DIN EN 16516 / QDF-Liste",
    geltungsbereich: "Alle relevanten Bauteile und Bauprodukte",
    qngRefNr: "9.1",
    bnbRefNr: "41"
  }
];

// src/data/standardsCatalogs.ts
var DEFAULT_QNG_MATRIX = [
  {
    id: "qng-1.1",
    nr: "1.1",
    standardCode: "QNG",
    kategorie: "1. \xDCbergreifende Anforderungen",
    bauteil: "\xDCbergreifende Anforderung f\xFCr die G\xFCte des Geb\xE4udes",
    anwendungsbereich: "Alle in der Kriterienmatrix aufgef\xFChrten Bauprodukte",
    betrachteteStoffe: "Besonders besorgniserregende Stoffe (SVHC)",
    bezugsnorm: "REACH-Verordnung (EG) Nr. 1907/2006",
    qs1: "Mindestanforderung: SVHC \u2264 0,10 % (w/w)",
    qs2: "Mindestanforderung: SVHC \u2264 0,10 % (w/w)",
    qs3: "Standard: SVHC \u2264 0,10 % (w/w) deklariert",
    qs4: "Ziel: Produktdokumentation und Deklaration enthaltener SVHC \u2264 0,10 % (w/w)",
    artDokumentation: "Gemische: SDB. Erzeugnisse: Herstellererkl\xE4rung, REACH-Konformit\xE4tspr\xFCfung",
    geltungsbereich: "S\xE4mtliche Bauprodukte und Erzeugnisse im Geb\xE4ude"
  },
  {
    id: "qng-2.1",
    nr: "2.1",
    standardCode: "QNG",
    kategorie: "2. Bodenbel\xE4ge",
    bauteil: "Textile Bodenbel\xE4ge (Teppichb\xF6den)",
    anwendungsbereich: "Alle textilen Bodenbel\xE4ge im Innenbereich",
    betrachteteStoffe: "VOC / Emissionen / gef\xE4hrliche Stoffe / PAK / Biozide",
    bezugsnorm: "MVV TB / GUT / DE-UZ 128",
    qs1: "Dokumentation",
    qs2: "GUT-Label oder DE-UZ 128",
    qs3: "DE-UZ 128 oder GUT-Label",
    qs4: "DE-UZ 128 oder GUT-Label mit Nachweis Inhaltsstoffe",
    artDokumentation: "Technisches Datenblatt mit Auslobung G\xFCtesiegel, Urkunde GUT / Blauer Engel, Herstellererkl\xE4rung",
    geltungsbereich: "S\xE4mtliche Teppichbel\xE4ge und Nadelvlies"
  },
  {
    id: "qng-2.2",
    nr: "2.2",
    standardCode: "QNG",
    kategorie: "2. Bodenbel\xE4ge",
    bauteil: "Elastische Bodenbel\xE4ge (Kautschuk, Polyolefine, Kork, Linoleum, PUR, PVC)",
    anwendungsbereich: "Alle Bodenbel\xE4ge in Innenr\xE4umen inkl. Technikr\xE4umen",
    betrachteteStoffe: "VOC / Emissionen / Nitrosamine / Phthalate / Schwermetalle / SVHC",
    bezugsnorm: "MVV TB / TRGS 552-2018 / AfPS GS 2019:01 / REACH 1907/2006",
    qs1: "Dokumentation AgBB",
    qs2: "Einhaltung AgBB-Schema, Kautschuk: Nitrosamine \u2264 0,011 mg/kg, PVC: Phthalate \u2264 0,10 %",
    qs3: "Einhaltung AgBB, PVC: Phthalate \u2264 0,10 %, keine Zinn-, Cadmium- und Bleistabilisatoren",
    qs4: "Einhaltung AgBB-Schema, Phthalatfrei (\u2264 0,10 %), ohne Cadmium-, Blei- und Zinnstabilisatoren",
    artDokumentation: "Technisches Datenblatt, freiwilliger Nachweis durch ETA / Gutachten nach MVV TB D3, Herstellererkl\xE4rung",
    geltungsbereich: "Elastische Bodenbel\xE4ge in allen Innenr\xE4umen"
  },
  {
    id: "qng-2.3",
    nr: "2.3",
    standardCode: "QNG",
    kategorie: "2. Bodenbel\xE4ge",
    bauteil: "Mehrschichtiges Holzparkett, Bambusbel\xE4ge & Laminat",
    anwendungsbereich: "Alle mehrschichtigen Bel\xE4ge aus Holz, Holzwerkstoffen, Bambus und Laminat",
    betrachteteStoffe: "VOC / Emissionen / Formaldehyd / Ger\xE4uchertes Holz (Ammoniak)",
    bezugsnorm: "MVV TB / DIN EN 17009 / DE-UZ 176",
    qs1: "Dokumentation E1",
    qs2: "Einhaltung AgBB-Schema, Ger\xE4uchertes Holz: Ammoniak (28d) \u2264 0,10 mg/m\xB3",
    qs3: "Einhaltung AgBB-Schema, Formaldehyd \u2264 0,08 ppm (0,096 mg/m\xB3)",
    qs4: "Einhaltung AgBB-Schema, Ger\xE4uchertes Holz: Ammoniak (28d) \u2264 0,10 mg/m\xB3, Formaldehyd \u2264 0,08 ppm",
    artDokumentation: "Technisches Datenblatt, ETA/Gutachten gem\xE4\xDF MVV TB D3, Herstellererkl\xE4rung",
    geltungsbereich: "Parkett, Holzfu\xDFb\xF6den, Bambus und Laminat"
  },
  {
    id: "qng-2.4",
    nr: "2.4",
    standardCode: "QNG",
    kategorie: "2. Bodenbel\xE4ge",
    bauteil: "Verlege- und D\xE4mmunterlagen unter Bodenbel\xE4gen",
    anwendungsbereich: "Verlege- und D\xE4mmplatten zum W\xE4rme- und Trittschallschutz",
    betrachteteStoffe: "VOC / Emissionen / PAK / BaP / Nitrosamine",
    bezugsnorm: "MVV TB / AfPS GS 2019:01",
    qs1: "Dokumentation",
    qs2: "Einhaltung AgBB-Schema, Gummi/Kautschuk: PAK \u2264 50 mg/kg, BaP \u2264 5,0 mg/kg",
    qs3: "Einhaltung AgBB-Schema, krebserzeugende Nitrosamine \u2264 0,011 mg/kg oder \u2264 0,0002 mg/m\xB3",
    qs4: "Einhaltung AgBB-Schema, PAK \u2264 50,0 mg/kg, BaP \u2264 5,0 mg/kg, Nitrosamine \u2264 0,011 mg/kg",
    artDokumentation: "Technisches Datenblatt, abZ, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Trittschalld\xE4mmung und Unterlagsbahnen unter Fu\xDFb\xF6den"
  },
  {
    id: "qng-3.1",
    nr: "3.1",
    standardCode: "QNG",
    kategorie: "3. Verlegewerkstoffe",
    bauteil: "Verlegewerkstoffe f\xFCr textile, elastische und h\xF6lzerne Wand- & Bodenbel\xE4ge",
    anwendungsbereich: "Grundierungen, Voranstriche, Spachtelmassen, Klebstoffe f\xFCr Wand und Boden",
    betrachteteStoffe: "VOC / Emissionen / Weichmacher / Biozide",
    bezugsnorm: "MVV TB / GEV-EMICODE EC1",
    qs1: "Dokumentation",
    qs2: "EMICODE EC1",
    qs3: "EMICODE EC1, Klebstoffe f\xFCr Bodenbel\xE4ge: Einhaltung AgBB-Schema",
    qs4: "EMICODE EC1, Klebstoffe f\xFCr Bodenbel\xE4ge: Einhaltung AgBB-Schema",
    artDokumentation: "Technisches Datenblatt, SDB, abZ, GEV-Zertifikat EMICODE EC1",
    geltungsbereich: "Verlegewerkstoffe unter Boden- und Wandbel\xE4gen"
  },
  {
    id: "qng-3.2",
    nr: "3.2",
    standardCode: "QNG",
    kategorie: "3. Verlegewerkstoffe",
    bauteil: "Verlegewerkstoffe f\xFCr keramische Fliesen, Naturstein & Betonwerkstein",
    anwendungsbereich: "Grundierungen, Voranstriche, Spachtelmassen, Kleber und Fugenm\xF6rtel",
    betrachteteStoffe: "VOC / Emissionen / Weichmacher / Biozide",
    bezugsnorm: "GEV-EMICODE",
    qs1: "Dokumentation",
    qs2: "Zement-Verlegem\xF6rtel oder EMICODE EC1",
    qs3: "Zement-Verlegem\xF6rtel oder EMICODE EC1",
    qs4: "Zement-Verlegem\xF6rtel oder EMICODE EC1",
    artDokumentation: "Technisches Datenblatt, SDB, GEV-Zertifikat EMICODE EC1",
    geltungsbereich: "Fliesenkleber, Fugenm\xF6rtel, Spachtelmassen im Nass- und Trockenbereich"
  },
  {
    id: "qng-3.3",
    nr: "3.3",
    standardCode: "QNG",
    kategorie: "3. Verlegewerkstoffe",
    bauteil: "Abdichtungen an Boden und Wand sowie Rissharze in Innenr\xE4umen",
    anwendungsbereich: "Fl\xFCssigabdichtungen unter Fliesen, Rissharze (EP, PU, PMMA, Acrylat)",
    betrachteteStoffe: "VOC / Emissionen / gef\xE4hrliche Stoffe",
    bezugsnorm: "GISCODE",
    qs1: "Dokumentation",
    qs2: "GISCODE D1, RE05, RE10, RE20, RE30, RU0,5, RU1, PU10, PU20, PU40 (ALT), PU50 (ALT) oder RMA10",
    qs3: "GISCODE D1, RE05, RE10, RE20, RE30, RU0,5, RU1, PU10, PU20, PU40, PU50 oder RMA10",
    qs4: "GISCODE D1, RE05, RE10, RE20, RE30, RU0,5, RU1, PU10, PU20, PU40, PU50 oder RMA10",
    artDokumentation: "Technisches Datenblatt mit Auslobung GISCODE, SDB, GEV-Zertifikat",
    geltungsbereich: "Verbundabdichtungen in Feuchtr\xE4umen und Rissverpressungen"
  },
  {
    id: "qng-4.1",
    nr: "4.1",
    standardCode: "QNG",
    kategorie: "4. Kleb- und Dichtstoffe",
    bauteil: "Bauseitig verarbeitete Kleb- und Dichtstoffe (Acrylate & Silikone) Innen",
    anwendungsbereich: "Fugen an W\xE4nden, Zargen, Fenstern, Sockelleisten, Teek\xFCchen, L\xFCftungskan\xE4len",
    betrachteteStoffe: "VOC / Chlorparaffine / Biozide / SVHC",
    bezugsnorm: "POP-VO / Biozid-VO 528/2012/EG",
    qs1: "Dokumentation",
    qs2: "Chlorparaffine \u2264 0,10 %, Deklaration biozider Wirkstoffe in Silikonen",
    qs3: "Chlorparaffine \u2264 0,10 %, Deklaration biozider Wirkstoffe in Silikonen",
    qs4: "Chlorparaffine \u2264 0,10 %, Deklaration biozider Wirkstoffe in Silikonen",
    artDokumentation: "Technisches Datenblatt, SDB, NDB und Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Sanit\xE4rfugen, Trockenbauanschlussfugen, Acrylate und Silikone"
  },
  {
    id: "qng-4.2",
    nr: "4.2",
    standardCode: "QNG",
    kategorie: "4. Kleb- und Dichtstoffe",
    bauteil: "Bauseitig verarbeitete PU-, PU-Hybrid- und SMP-Dichtstoffe Innen",
    anwendungsbereich: "Fugen an Fenstern, PR-Profilen, Doppelb\xF6den, St\xFCtzenkleber",
    betrachteteStoffe: "VOC / Chlorparaffine / TCEP / PBB / PBDE / SVHC / L\xF6semittel",
    bezugsnorm: "TRGS 610 / GISCODE / POP-VO / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Chlorparaffine, TCEP, PBB und PBDE \u2264 0,10 %, l\xF6semittelfrei oder GISCODE PU10/PU20/PU40/PU50",
    qs3: "Chlorparaffine, TCEP, PBB und PBDE \u2264 0,10 %, l\xF6semittelfrei oder GISCODE PU10/20/40/50",
    qs4: "Chlorparaffine, TCEP, PBB und PBDE \u2264 0,10 %, l\xF6semittelfrei oder GISCODE PU10/20/40/50",
    artDokumentation: "Technisches Datenblatt mit Auslobung GISCODE, SDB, NDB, Herstellererkl\xE4rung",
    geltungsbereich: "PU- und SMP-Fugendichtstoffe im Innenraum"
  },
  {
    id: "qng-4.3",
    nr: "4.3",
    standardCode: "QNG",
    kategorie: "4. Kleb- und Dichtstoffe",
    bauteil: "Kleb- und Dichtstoffe (PU, SMP, MS-Polymer) f\xFCr Luftdichtheit Au\xDFen",
    anwendungsbereich: "Punkt- und linienf\xF6rmige Verklebungen an Fassade, Fenstern, Au\xDFent\xFCren",
    betrachteteStoffe: "VOC / Chlorparaffine / PBB / PBDE / TCEP / SVHC",
    bezugsnorm: "POP-VO / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Chlorparaffine, TCEP, PBB und PBDE \u2264 0,10 %",
    qs3: "Chlorparaffine, TCEP, PBB und PBDE \u2264 0,10 %",
    qs4: "Chlorparaffine, TCEP, PBB und PBDE \u2264 0,10 %",
    artDokumentation: "Technisches Datenblatt, SDB, NDB, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Luftdichtheitskleber und Fassadendichtstoffe Au\xDFen"
  },
  {
    id: "qng-4.4",
    nr: "4.4",
    standardCode: "QNG",
    kategorie: "4. Kleb- und Dichtstoffe",
    bauteil: "Tapetenkleber",
    anwendungsbereich: "Alle Klebstoffe f\xFCr Papiertapeten, Raufaser, Vliestapeten",
    betrachteteStoffe: "VOC / gef\xE4hrliche Stoffe",
    bezugsnorm: "GISCODE / VdL-Richtlinie 01",
    qs1: "Dokumentation",
    qs2: "Pulverprodukte oder GISCODE D1",
    qs3: "Pulverprodukte oder GISCODE D1",
    qs4: "Pulverprodukte oder GISCODE D1",
    artDokumentation: "Technisches Datenblatt mit Auslobung GISCODE, SDB, NDB",
    geltungsbereich: "Tapetenkleister und Klebstoffe f\xFCr Wandbel\xE4ge"
  },
  {
    id: "qng-4.5",
    nr: "4.5",
    standardCode: "QNG",
    kategorie: "4. Kleb- und Dichtstoffe",
    bauteil: "Klebstoffe f\xFCr W\xE4rmed\xE4mmstoffe an Fassade und Dach",
    anwendungsbereich: "Dispersions- und PU-Klebstoffe f\xFCr Fassaden- und Dachd\xE4mmung",
    betrachteteStoffe: "VOC / Chlorparaffine / PBB / PBDE / TCEP / SVHC",
    bezugsnorm: "TRGS 610 / POP-VO / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "VOC \u2264 40,0 g/l, Chlorparaffine \u2264 0,10 %, PU-Klebstoffe: PBB, PBDE, TCEP \u2264 0,10 %",
    qs3: "VOC \u2264 40,0 g/l, Chlorparaffine \u2264 0,10 %, PU-Klebstoffe: PBB, PBDE, TCEP \u2264 0,10 %",
    qs4: "VOC \u2264 40,0 g/l, Chlorparaffine \u2264 0,10 %, PU-Klebstoffe: PBB, PBDE, TCEP \u2264 0,10 %",
    artDokumentation: "Technisches Datenblatt, SDB, NDB, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "D\xE4mmstoffkleber f\xFCr WDVS und Flachdach"
  },
  {
    id: "qng-5.1",
    nr: "5.1",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Au\xDFenputze auf Beton, Mauerwerk oder WDVS",
    anwendungsbereich: "Fassadenputze mit und ohne Filmschutz / algizide Ausr\xFCstung",
    betrachteteStoffe: "Biozide (Beschichtungsschutzmittel)",
    bezugsnorm: "Biozid-Verordnung 528/2012/EG (Produktart 7)",
    qs1: "Dokumentation",
    qs2: "Deklaration biozider Wirkstoffe (sofern eingesetzt)",
    qs3: "Deklaration biozider Wirkstoffe (sofern eingesetzt)",
    qs4: "Deklaration biozider Wirkstoffe (sofern eingesetzt)",
    artDokumentation: "Technisches Datenblatt, SDB, NDB",
    geltungsbereich: "S\xE4mtliche mineralischen und organischen Fassadenau\xDFenputze"
  },
  {
    id: "qng-5.2",
    nr: "5.2",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Fassadenfarben inkl. Grundierungen",
    anwendungsbereich: "Fassadenbeschichtungen auf Beton, Mauerwerk, Putz, WDVS, Fassadentapeten",
    betrachteteStoffe: "VOC / Biozide / Schwermetalle (Blei)",
    bezugsnorm: "2004/42/EG / 1907/2006/EG / 528/2012/EG",
    qs1: "Dokumentation",
    qs2: "VOC \u2264 30,0 g/l (wasserbasiert), Deklaration biozider Wirkstoffe, Blei \u2264 0,10 %",
    qs3: "VOC \u2264 30,0 g/l (wasserbasiert), Deklaration biozider Wirkstoffe, Blei \u2264 0,10 %",
    qs4: "VOC \u2264 30,0 g/l (wasserbasiert), Deklaration biozider Wirkstoffe, Blei \u2264 0,10 %",
    artDokumentation: "Technisches Datenblatt, SDB, NDB",
    geltungsbereich: "Aussenwandfarben und Grundierungen"
  },
  {
    id: "qng-5.3",
    nr: "5.3",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Beschichtungen auf mineralischen Oberfl\xE4chen Innen",
    anwendungsbereich: "Spachtelmassen, Dispersionsspachtel (Q-Spachtel), Haftgr\xFCnde, Betonkosmetik",
    betrachteteStoffe: "VOC / Emissionen / Kunstharzestriche AgBB",
    bezugsnorm: "MVV TB / 2004/42/EG / VdL-Richtlinie 01",
    qs1: "Dokumentation",
    qs2: "VOC \u2264 30,0 g/l (wasserbasiert), Kunstharzestriche: Einhaltung AgBB-Schema",
    qs3: "VOC \u2264 30,0 g/l (wasserbasiert), Kunstharzestriche: Einhaltung AgBB-Schema",
    qs4: "VOC \u2264 30,0 g/l (wasserbasiert), Kunstharzestriche: Einhaltung AgBB-Schema",
    artDokumentation: "Technisches Datenblatt mit Auslobung ELF-G\xFCte, SDB, NDB, ETA/Gutachten MVV TB D3",
    geltungsbereich: "Innenwand- und Decken-Spachtelmassen, Q-Spachtel, Tiefgrund"
  },
  {
    id: "qng-5.4",
    nr: "5.4",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Flammhemmend ausger\xFCstete Gewebe und Vliese Innen",
    anwendungsbereich: "Belegung von Wand- und Deckenfl\xE4chen mit Malervlies und Glasfasergewebe",
    betrachteteStoffe: "Chlorparaffine / PBB / PBDE / TCEP / SVHC",
    bezugsnorm: "POP-VO / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Chlorparaffine, PBB, PBDE, TCEP \u2264 0,10 %",
    qs3: "Chlorparaffine, PBB, PBDE, TCEP \u2264 0,10 %",
    qs4: "Chlorparaffine, PBB, PBDE, TCEP \u2264 0,10 %",
    artDokumentation: "Technisches Datenblatt, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Malervliese und Glasfasergewebe im Innenausbau"
  },
  {
    id: "qng-5.5",
    nr: "5.5",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Innenwand- und Deckenfarben",
    anwendungsbereich: "Beschichtungen auf Beton, Mauerwerk, M\xF6rtel, Spachtel, Putzen, Gips, Tapeten",
    betrachteteStoffe: "VOC / Emissionen / Formaldehyd / Weichmacher / Biozide / Schwermetalle",
    bezugsnorm: "2004/42/EG / VdL-Richtlinie 01",
    qs1: "Dokumentation",
    qs2: "L\xF6semittelfrei, formaldehydfrei und weichmacherfrei gem\xE4\xDF VdL-Richtlinie 01",
    qs3: "L\xF6semittelfrei, formaldehydfrei und weichmacherfrei gem\xE4\xDF VdL-Richtlinie 01",
    qs4: "L\xF6semittelfrei, formaldehydfrei und weichmacherfrei gem\xE4\xDF VdL-Richtlinie 01",
    artDokumentation: "Technisches Datenblatt mit Auslobung ELF-G\xFCte, SDB, NDB",
    geltungsbereich: "S\xE4mtliche Wand- und Deckenfarben im Innenraum"
  },
  {
    id: "qng-5.6",
    nr: "5.6",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Acrylat-Beschichtungen mineralischer Untergr\xFCnde mit besonderen Anforderungen",
    anwendungsbereich: "Schutzbeschichtungen mit WHG-Zulassung (Sprinklertanks, Aufzugschacht, Technik)",
    betrachteteStoffe: "VOC / L\xF6semittel",
    bezugsnorm: "Decopaint-Richtlinie 2004/42/EG",
    qs1: "Dokumentation",
    qs2: "VOC \u2264 30,0 g/l (wasserbasierte Rezeptur)",
    qs3: "VOC \u2264 30,0 g/l (wasserbasierte Rezeptur)",
    qs4: "VOC \u2264 30,0 g/l (wasserbasierte Rezeptur)",
    artDokumentation: "Technisches Datenblatt, SDB",
    geltungsbereich: "Spezialbeschichtungen f\xFCr Technikr\xE4ume und Auffangwannen"
  },
  {
    id: "qng-5.7",
    nr: "5.7",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Kunstharzestriche & reaktive PU-Beschichtungen auf mineralischen Oberfl\xE4chen",
    anwendungsbereich: "PU-Versiegelungen, Wandbeschichtungen, 2K-PU-Lacke, Fl\xFCssigkunststoff",
    betrachteteStoffe: "VOC / Emissionen / AgBB / GISCODE",
    bezugsnorm: "MVV TB / GISCODE",
    qs1: "Dokumentation",
    qs2: "Kunstharzestriche & PU-Beschichtungen: AgBB-Schema, Total solid oder GISCODE PU10/20/30/40/50",
    qs3: "Einhaltung AgBB-Schema, Total solid oder GISCODE PU10, PU20, PU30, PU40, PU50",
    qs4: "Einhaltung AgBB-Schema, Total solid oder GISCODE PU10, PU20, PU30, PU40, PU50",
    artDokumentation: "SDB, NDB, TD mit Auslobung GISCODE und AgBB-G\xFCte, ETA/Gutachten MVV TB D3",
    geltungsbereich: "PU-Boden- und Wandbeschichtungen an mineralischen Fl\xE4chen"
  },
  {
    id: "qng-5.8",
    nr: "5.8",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Kunstharzestriche & reaktive Epoxidharzbeschichtungen (EP)",
    anwendungsbereich: "EP-Versiegelungen, EP-Wandbeschichtungen, 2K-EP-Lacke, EP-Bodenbeschichtungen",
    betrachteteStoffe: "VOC / Emissionen / AgBB / GISCODE",
    bezugsnorm: "MVV TB / GISCODE",
    qs1: "Dokumentation",
    qs2: "Einhaltung AgBB-Schema, GISCODE RE05, RE10, RE20, RE30, RE40 oder RE50",
    qs3: "Einhaltung AgBB-Schema, GISCODE RE05, RE10, RE20, RE30, RE40 oder RE50",
    qs4: "Einhaltung AgBB-Schema, GISCODE RE05, RE10, RE20, RE30, RE40 oder RE50",
    artDokumentation: "SDB, NDB, TD mit Auslobung GISCODE und AgBB-G\xFCte, ETA/Gutachten MVV TB D3",
    geltungsbereich: "Epoxidharz-Boden- und Wandbeschichtungen"
  },
  {
    id: "qng-5.9",
    nr: "5.9",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "OS-Systeme aus EP- und PU-Beschichtungen (Industrieb\xF6den, Parkfl\xE4chen)",
    anwendungsbereich: "Beschichtungen von Industrieb\xF6den, Parkfl\xE4chen, Tiefgaragen inkl. Sockel",
    betrachteteStoffe: "VOC / gef\xE4hrliche Stoffe / GISCODE",
    bezugsnorm: "GISCODE",
    qs1: "Dokumentation",
    qs2: "GISCODE PU10, PU20, PU30, PU40, PU50, PU60 oder RE05, RE10, RE20, RE30, RE40, RE50",
    qs3: "GISCODE PU10-PU60 / RE05-RE50",
    qs4: "GISCODE PU10-PU60 / RE05-RE50",
    artDokumentation: "SDB, NDB, Technisches Datenblatt mit Auslobung GISCODE",
    geltungsbereich: "OS-8 / OS-11 Oberfl\xE4chenschutzsysteme in Garagen und Hallen"
  },
  {
    id: "qng-5.10",
    nr: "5.10",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Kunstharzestriche & PMMA-Beschichtungen (auch OS-Systeme)",
    anwendungsbereich: "PMMA-Beschichtungen von Estrich, Terrazzo, PMMA-Fl\xFCssigkunststoff f\xFCr Abdichtungen",
    betrachteteStoffe: "VOC / Emissionen / AgBB",
    bezugsnorm: "MVV TB",
    qs1: "Dokumentation",
    qs2: "Kunstharzestriche inkl. PMMA-Beschichtungen Innen: Einhaltung AgBB-Schema",
    qs3: "Einhaltung AgBB-Schema",
    qs4: "Einhaltung AgBB-Schema",
    artDokumentation: "SDB, NDB, TD mit AgBB-G\xFCte, ETA/Gutachten MVV TB D3",
    geltungsbereich: "PMMA-Schnellbeschichtungen und Abdichtungen"
  },
  {
    id: "qng-5.11",
    nr: "5.11",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Nicht filmbildende Impr\xE4gnierungen",
    anwendungsbereich: "Impr\xE4gnierungen auf Natur- und Betonwerksteinbodenbel\xE4gen im Innenbereich",
    betrachteteStoffe: "VOC / gef\xE4hrliche Stoffe / GISCODE",
    bezugsnorm: "GISCODE",
    qs1: "Dokumentation",
    qs2: "GISCODE GH0, GH10 (entaromatisiert) und GH40",
    qs3: "GISCODE GH0, GH10 (entaromatisiert) und GH40",
    qs4: "GISCODE GH0, GH10 (entaromatisiert) und GH40",
    artDokumentation: "Technisches Datenblatt mit Auslobung GISCODE, SDB",
    geltungsbereich: "Stein- und Betontiefenimpr\xE4gnierungen"
  },
  {
    id: "qng-5.12",
    nr: "5.12",
    standardCode: "QNG",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Betontrennmittel",
    anwendungsbereich: "Schal\xF6le und Trennmittel f\xFCr die Betonage",
    betrachteteStoffe: "Gef\xE4hrliche Stoffe / GISCODE",
    bezugsnorm: "GISCODE",
    qs1: "Dokumentation",
    qs2: "GISCODE BTM01, BTM05, BTM10 oder BTM15",
    qs3: "GISCODE BTM01, BTM05, BTM10 oder BTM15",
    qs4: "GISCODE BTM01, BTM05, BTM10 oder BTM15",
    artDokumentation: "Technisches Datenblatt mit Auslobung GISCODE, SDB",
    geltungsbereich: "Schal\xF6le auf der Baustelle und im Fertigteilwerk"
  },
  {
    id: "qng-6.1",
    nr: "6.1",
    standardCode: "QNG",
    kategorie: "6. Beschichtungen Metall/Holz/Kunststoff",
    bauteil: "Bauseitige Beschichtungen auf Holz, Metall und Kunststoff Innen & Au\xDFen",
    anwendungsbereich: "1K- und 2K-Lackierungen, Lasuren, Stahltr\xE4ger, T\xFCren, Gel\xE4nder, Heizungsrohre",
    betrachteteStoffe: "VOC / Schwermetalle (Blei, Cadmium, Chrom-VI)",
    bezugsnorm: "2004/42/EG / 1907/2006/EG / DE-UZ 12a",
    qs1: "Dokumentation",
    qs2: "VOC \u2264 130,0 g/l (wasserbasiert), keine Pigmente/Sikkative auf Basis Blei, Cadmium, Chrom-VI",
    qs3: "VOC \u2264 130,0 g/l (wasserbasiert), schwermetallfrei",
    qs4: "VOC \u2264 130,0 g/l (wasserbasiert), schwermetallfrei",
    artDokumentation: "TD, SDB, NDB, Herstellererkl\xE4rung",
    geltungsbereich: "Lackierungen und Lasuren auf Holz, Metall und Kunststoffen"
  },
  {
    id: "qng-6.2",
    nr: "6.2",
    standardCode: "QNG",
    kategorie: "6. Beschichtungen Metall/Holz/Kunststoff",
    bauteil: "Bauseitige Beschichtungen auf Fu\xDFbodenbel\xE4gen (Parkettlacke)",
    anwendungsbereich: "Lacke auf PU-/PU-Hybridbasis inkl. Grundierung/F\xFCller auf Parkett, Treppen, Kork",
    betrachteteStoffe: "VOC / Emissionen / Schwermetalle / AgBB / GISCODE",
    bezugsnorm: "MVV TB / Emissionen / GISCODE / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Einhaltung AgBB-Schema, GISCODE W1, W2+, W1/DD, W2/DD+, W3+ oder W3/DD+, schwermetallfrei",
    qs3: "Einhaltung AgBB-Schema, GISCODE W1-W3/DD+, schwermetallfrei",
    qs4: "Einhaltung AgBB-Schema, GISCODE W1-W3/DD+, schwermetallfrei",
    artDokumentation: "SDB, NDB, TD mit Auslobung GISCODE und AgBB-G\xFCte, abZ, Herstellererkl\xE4rung",
    geltungsbereich: "Parkettlacke und Versiegelungen"
  },
  {
    id: "qng-6.5",
    nr: "6.5",
    standardCode: "QNG",
    kategorie: "6. Beschichtungen Metall/Holz/Kunststoff",
    bauteil: "Beschichtung von Holzerzeugnissen mit \xD6len, Wachsen & 2K-\xD6l-Hybriden",
    anwendungsbereich: "Oberfl\xE4chenverg\xFCtung von Parkett, Treppenstufen, Holzverkleidungen Innen",
    betrachteteStoffe: "VOC / Emissionen / AgBB / GISCODE \xD610/\xD620",
    bezugsnorm: "MVV TB / GISCODE",
    qs1: "Dokumentation",
    qs2: "Beschichtung Parkett: Einhaltung AgBB-Schema, GISCODE \xD610, \xD610+, \xD610/DD+, \xD620 oder \xD620+",
    qs3: "Einhaltung AgBB-Schema, GISCODE \xD610-\xD620+",
    qs4: "Einhaltung AgBB-Schema, GISCODE \xD610-\xD620+",
    artDokumentation: "SDB, NDB, TD mit Auslobung GISCODE und AgBB-G\xFCte, abZ",
    geltungsbereich: "Natur\xF6le, Hartwachs\xF6le und \xD6lsysteme"
  },
  {
    id: "qng-7.1",
    nr: "7.1",
    standardCode: "QNG",
    kategorie: "7. Korrosions- & Brandschutz",
    bauteil: "Korrosionsschutzbeschichtungen C2 hoch (Tragende Metalle > 3 mm)",
    anwendungsbereich: "Nassbeschichtungen f\xFCr tragende Metallbauteile (Stahltr\xE4ger, Atriumkonstruktion)",
    betrachteteStoffe: "VOC-Gehalt des Gesamtaufbaus",
    bezugsnorm: "2004/42/EG / DIN EN ISO 12944",
    qs1: "Dokumentation",
    qs2: "VOC \u2264 140,0 g/l (wasserbasierte Rezeptur)",
    qs3: "VOC \u2264 140,0 g/l (wasserbasierte Rezeptur)",
    qs4: "VOC \u2264 140,0 g/l (wasserbasierte Rezeptur)",
    artDokumentation: "Technisches Datenblatt, SDB",
    geltungsbereich: "Nass-Korrosionsschutz C2 hoch"
  },
  {
    id: "qng-7.2",
    nr: "7.2",
    standardCode: "QNG",
    kategorie: "7. Korrosions- & Brandschutz",
    bauteil: "Korrosionsschutz tragender Metallbauteile C3 hoch (Innen & Au\xDFen)",
    anwendungsbereich: "Nassbeschichtungen f\xFCr tragende Metallbauteile (Stahltr\xE4ger, Br\xFCcken)",
    betrachteteStoffe: "VOC-Gehalt des Gesamtsystems",
    bezugsnorm: "2004/42/EG / DIN EN ISO 12944",
    qs1: "Dokumentation",
    qs2: "Beschichtungssystem mit VOC-Gehalt \u2264 90,0 g/m\xB2 (Gesamtsystem)",
    qs3: "Beschichtungssystem mit VOC-Gehalt \u2264 90,0 g/m\xB2 (Gesamtsystem)",
    qs4: "Beschichtungssystem mit VOC-Gehalt \u2264 90,0 g/m\xB2 (Gesamtsystem)",
    artDokumentation: "TD, SDB, Herstellererkl\xE4rung und VOC-Berechnung des Schichtaufbaues",
    geltungsbereich: "Nass-Korrosionsschutz C3 hoch"
  },
  {
    id: "qng-7.3",
    nr: "7.3",
    standardCode: "QNG",
    kategorie: "7. Korrosions- & Brandschutz",
    bauteil: "Korrosionsschutz tragender Metallbauteile > C3 hoch",
    anwendungsbereich: "Nassbeschichtungen f\xFCr tragende Metallbauteile (Stahltr\xE4ger, Au\xDFenbauteile)",
    betrachteteStoffe: "VOC-Gehalt des Gesamtsystems",
    bezugsnorm: "2004/42/EG / DIN EN ISO 12944",
    qs1: "Dokumentation",
    qs2: "Beschichtungssystem mit VOC-Gehalt \u2264 120,0 g/m\xB2 (Gesamtsystem)",
    qs3: "Beschichtungssystem mit VOC-Gehalt \u2264 120,0 g/m\xB2 (Gesamtsystem)",
    qs4: "Beschichtungssystem mit VOC-Gehalt \u2264 120,0 g/m\xB2 (Gesamtsystem)",
    artDokumentation: "TD, SDB, Herstellererkl\xE4rung und VOC-Berechnung des Schichtaufbaues",
    geltungsbereich: "Nass-Korrosionsschutz C4/C5 hoch"
  },
  {
    id: "qng-7.4",
    nr: "7.4",
    standardCode: "QNG",
    kategorie: "7. Korrosions- & Brandschutz",
    bauteil: "Korrosionsschutz nicht tragender Metallbauteile Innen & Au\xDFen",
    anwendungsbereich: "Treppengel\xE4nder, Zargen, Stahlt\xFCren, Fassadenelemente, Metalldecken, Heizk\xF6rper",
    betrachteteStoffe: "VOC-Gehalt",
    bezugsnorm: "Decopaint-Richtlinie 2004/42/EG",
    qs1: "Dokumentation",
    qs2: "VOC \u2264 300,0 g/l",
    qs3: "VOC \u2264 300,0 g/l",
    qs4: "VOC \u2264 300,0 g/l",
    artDokumentation: "TD, SDB, NDB",
    geltungsbereich: "Nichttragende Metallbauteilbeschichtungen"
  },
  {
    id: "qng-7.5",
    nr: "7.5",
    standardCode: "QNG",
    kategorie: "7. Korrosions- & Brandschutz",
    bauteil: "Nassbeschichtungen f\xFCr den Brandschutz im Stahlbau",
    anwendungsbereich: "Reaktive Brandschutzbeschichtungen auf Stahlbauteilen (1K- und 2K-Systeme)",
    betrachteteStoffe: "VOC / Emissionen / Halogene / SVHC",
    bezugsnorm: "MVV TB / 2004/42/EG",
    qs1: "Dokumentation",
    qs2: "Einhaltung AgBB-Schema oder ETA, halogenfreies Produkt, VOC \u2264 50,0 g/l",
    qs3: "AgBB-Schema / ETA, halogenfrei, VOC \u2264 50,0 g/l",
    qs4: "AgBB-Schema / ETA, halogenfrei, VOC \u2264 50,0 g/l",
    artDokumentation: "SDB, TD mit Auslobung AgBB-G\xFCte, abZ, ETA, Herstellererkl\xE4rung",
    geltungsbereich: "D\xE4mmschichtbildende Brandschutzanstriche im Stahlbau"
  },
  {
    id: "qng-8.1",
    nr: "8.1",
    standardCode: "QNG",
    kategorie: "8. Chemischer Holzschutz",
    bauteil: "Chemische Holzschutzmittel nach DIN 68800-3 in Innenr\xE4umen",
    anwendungsbereich: "Vorbeugende Behandlung tragender Holzbauteile nebst Auskragungen nach au\xDFen",
    betrachteteStoffe: "Biozide / SVHC: Borverbindungen",
    bezugsnorm: "Biozid-VO 528/2012/EG (Produktart 8) / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Reproduktionstoxische Borverbindungen \u2264 0,10 %, Deklaration biozider Wirkstoffe, GK0/1: nur konstruktiv, GK2/3: zugelassene Biozidprodukte nach 528/2012/EG",
    qs3: "Borverbindungen \u2264 0,10 %, GK0/1: konstruktiv, GK2/3: zugelassene Biozide",
    qs4: "Borverbindungen \u2264 0,10 %, GK0/1: konstruktiv, GK2/3: zugelassene Biozide",
    artDokumentation: "TD, SDB, Ausz\xFCge aus LVs, Konstruktionspl\xE4nen, Begleitpapiere DIN 68800-3",
    geltungsbereich: "Tragende Holzbauteile im Innenraum"
  },
  {
    id: "qng-8.2",
    nr: "8.2",
    standardCode: "QNG",
    kategorie: "8. Chemischer Holzschutz",
    bauteil: "Chemische Holzschutzmittel in Sondergeb\xE4uden (hohe Feuchte)",
    anwendungsbereich: "Tragende Holzbauteile Au\xDFen/Feuchtraum (Atrien, Schwimmhallen, Eissporthallen)",
    betrachteteStoffe: "Biozide / SVHC: Borverbindungen",
    bezugsnorm: "528/2012/EG / 1907/2006/EG / DIN EN 350",
    qs1: "Dokumentation",
    qs2: "Borverbindungen \u2264 0,10 %, Deklaration Biozide, GK1: konstruktiv, GK2: konstruktiv oder Dauerhaftigkeit 1-3, GK3/4: zugelassene Biozide",
    qs3: "Borverbindungen \u2264 0,10 %, GK1-2 konstruktiv/EN 350, GK3-4 zugelassene Biozide",
    qs4: "Borverbindungen \u2264 0,10 %, GK1-2 konstruktiv/EN 350, GK3-4 zugelassene Biozide",
    artDokumentation: "TD, SDB, Begleitpapiere gem\xE4\xDF DIN 68800-3 Kap 7",
    geltungsbereich: "Tragholz in Feuchtbereichen und Sonderbauten"
  },
  {
    id: "qng-8.3",
    nr: "8.3",
    standardCode: "QNG",
    kategorie: "8. Chemischer Holzschutz",
    bauteil: "Chemische Holzschutzmittel auf nichttragenden Bauteilen",
    anwendungsbereich: "Impr\xE4gnierung von Holzfenstern, Fassadenbekleidungen, Wand-/Deckenbekleidungen",
    betrachteteStoffe: "Biozide / SVHC: Borverbindungen",
    bezugsnorm: "MVV TB / ChemVerbotsV / DE-UZ 76 / 528/2012/EG",
    qs1: "Dokumentation",
    qs2: "Borverbindungen \u2264 0,10 %, Deklaration Biozide, In Innenr\xE4umen KEINE Biozide zugelassen!, Fenster/au\xDFen: zugelassene Biozide",
    qs3: "In Innenr\xE4umen KEINE Biozide zugelassen, au\xDFen: zugelassene Biozide",
    qs4: "In Innenr\xE4umen KEINE Biozide zugelassen, au\xDFen: zugelassene Biozide",
    artDokumentation: "TD, SDB, Ausz\xFCge LVs, Begleitpapiere DIN 68800-3 Kap 7",
    geltungsbereich: "Nichttragende Holzbauteile, Fenster, Verkleidungen"
  },
  {
    id: "qng-9.1",
    nr: "9.1",
    standardCode: "QNG",
    kategorie: "9. Holzwerkstoffplatten",
    bauteil: "Holzwerkstoffe (FPY, OSB und HPL) f\xFCr Holzbau & Innenausbau",
    anwendungsbereich: "Spanplatten, Hochdruckschichtstoff- (HPL) und OSB-Platten f\xFCr Trockenbau/M\xF6bel",
    betrachteteStoffe: "Formaldehyd / VOC / Emissionen / Borverbindungen",
    bezugsnorm: "MVV TB / ChemVerbotsV / DE-UZ 76 / 1907/2006/EG",
    qs1: "Dokumentation E1",
    qs2: "Einhaltung AgBB-Schema, Formaldehyd \u2264 0,08 ppm (0,096 mg/m\xB3 in Pr\xFCfkammer), Borverbindungen \u2264 0,10 %",
    qs3: "Einhaltung AgBB, Formaldehyd \u2264 0,08 ppm, Borverbindungen \u2264 0,10 %",
    qs4: "Einhaltung AgBB, Formaldehyd \u2264 0,08 ppm, Borverbindungen \u2264 0,10 %",
    artDokumentation: "TD mit Auslobung AgBB-G\xFCte, ETA/Gutachten MVV TB D3, Formaldehyd-Pr\xFCfbericht",
    geltungsbereich: "Spanplatten, OSB, HPL im Innenausbau"
  },
  {
    id: "qng-9.2",
    nr: "9.2",
    standardCode: "QNG",
    kategorie: "9. Holzwerkstoffplatten",
    bauteil: "Holzwerkstoffe (Tischler-, Faser-, Furnier- und Massivholzplatten)",
    anwendungsbereich: "Alle Tischler-, MDF-, Faser-, Furnier- und Massivholzplatten f\xFCr Innenausbau",
    betrachteteStoffe: "Formaldehyd / VOC / Emissionen / Borverbindungen",
    bezugsnorm: "ChemVerbotsV / DIN EN 16516 / DE-UZ 76 / 1907/2006/EG",
    qs1: "Dokumentation E1",
    qs2: "Formaldehyd \u2264 0,08 ppm (0,096 mg/m\xB3 in Pr\xFCfkammer), Borverbindungen \u2264 0,10 %",
    qs3: "Formaldehyd \u2264 0,08 ppm, Borverbindungen \u2264 0,10 %",
    qs4: "Formaldehyd \u2264 0,08 ppm, Borverbindungen \u2264 0,10 %",
    artDokumentation: "TD, Emissions-Pr\xFCfbericht zu Formaldehyd, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "MDF, Tischlerplatten, Sperrholz, Massivholzplatten"
  },
  {
    id: "qng-10.1",
    nr: "10.1",
    standardCode: "QNG",
    kategorie: "10. Bitumenprodukte",
    bauteil: "Kalt verarbeitete Bitumenhaftgr\xFCnde & Bitumendickbeschichtungen",
    anwendungsbereich: "Vorstriche unter Dachabdichtungen, Bauwerksabdichtungen gegen Erdreich",
    betrachteteStoffe: "VOC / gef\xE4hrliche Stoffe / GISCODE",
    bezugsnorm: "GISCODE",
    qs1: "Dokumentation",
    qs2: "GISCODE BBP 10 oder BBP 20",
    qs3: "GISCODE BBP 10 oder BBP 20",
    qs4: "GISCODE BBP 10 oder BBP 20",
    artDokumentation: "Technisches Datenblatt, SDB",
    geltungsbereich: "Bitumendickbeschichtungen und Kaltanstrich"
  },
  {
    id: "qng-10.2",
    nr: "10.2",
    standardCode: "QNG",
    kategorie: "10. Bitumenprodukte",
    bauteil: "Bitumin\xF6se Vorstriche & Verbundabdichtungen f\xFCr Umkehrd\xE4cher",
    anwendungsbereich: "Bitumenvoranstrich und Haftgrund bei Umkehrd\xE4chern",
    betrachteteStoffe: "VOC / gef\xE4hrliche Stoffe / GISCODE",
    bezugsnorm: "GISCODE",
    qs1: "Dokumentation",
    qs2: "GISCODE BBP 10, BBP 20 oder BBP 30",
    qs3: "GISCODE BBP 10, BBP 20 oder BBP 30",
    qs4: "GISCODE BBP 10, BBP 20 oder BBP 30",
    artDokumentation: "Technisches Datenblatt, SDB",
    geltungsbereich: "Bitumenvoranstriche f\xFCr Umkehrd\xE4cher"
  },
  {
    id: "qng-10.3",
    nr: "10.3",
    standardCode: "QNG",
    kategorie: "10. Bitumenprodukte",
    bauteil: "Bitumenbahnen f\xFCr die Dachabdichtung (bewittert)",
    anwendungsbereich: "Durch Regenwasser bewitterte Bitumenbahnen auf D\xE4chern (ohne Gr\xFCndach)",
    betrachteteStoffe: "Biozide / Wurzelschutzmittel / CMR-Stoffe / Mecoprop",
    bezugsnorm: "MVV TB / DIN CEN/TS 16637-2 / Biozid-VO 528/2012/EG",
    qs1: "Dokumentation",
    qs2: "Keine CMR-Stoffe Kat. 1A/1B, Deklaration biozider Wirkstoffe, Eluat kumulierter Austrag Mecoprop \u2264 47,0 mg/m\xB2",
    qs3: "Keine CMR Kat. 1A/1B, Mecoprop-Eluat \u2264 47,0 mg/m\xB2",
    qs4: "Keine CMR Kat. 1A/1B, Mecoprop-Eluat \u2264 47,0 mg/m\xB2",
    artDokumentation: "TD, SDB, Pr\xFCfzeugnis Elutionsversuch nach CEN/TS 16637-2, ETA/Gutachten MVV TB D3",
    geltungsbereich: "Bewitterte Dachabdichtungsbitumenbahnen"
  },
  {
    id: "qng-11.1",
    nr: "11.1",
    standardCode: "QNG",
    kategorie: "11. Kunststoffe & Metalle",
    bauteil: "Kunststoffe (PVC) f\xFCr Innenraum-Oberfl\xE4chen & Geb\xE4udeh\xFClle",
    anwendungsbereich: "Vinyltapeten, Wandbekleidungen, Lichtkuppeln, PVC-Fenster, Abdichtungsfolien",
    betrachteteStoffe: "Schwermetalle (Blei, Cadmium, Zinn) / Emissionen / Phthalate",
    bezugsnorm: "MVV TB / REACH 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Keine Zinn-, Cadmium- und Bleistabilisatoren, Wandbekleidungen: AgBB, Phthalate \u2264 0,10 %",
    qs3: "Keine Sn/Cd/Pb-Stabilisatoren, AgBB, Phthalate \u2264 0,10 %",
    qs4: "Keine Sn/Cd/Pb-Stabilisatoren, AgBB, Phthalat-Weichmacher \u2264 0,10 %",
    artDokumentation: "TD mit AgBB-G\xFCte, ETA/Gutachten MVV TB D3, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "PVC-Wandbel\xE4ge, PVC-Fenster, Folienabdichtungen"
  },
  {
    id: "qng-11.3",
    nr: "11.3",
    standardCode: "QNG",
    kategorie: "11. Kunststoffe & Metalle",
    bauteil: "Direkt bewitterte Metallbleche an Dach und Fassade (> 50 m\xB2)",
    anwendungsbereich: "Unbeschichtete Bleche aus Kupfer, Titanzink und verzinktem Stahl (> 50 m\xB2)",
    betrachteteStoffe: "Schwermetalle (Kupfer, Zink)",
    bezugsnorm: "UBA-Leitfaden 17/05",
    qs1: "Dokumentation",
    qs2: "Regenwasserreinigungsanlagen bei Metallfl\xE4chen insgesamt > 50 m\xB2 bzw. Nachweis Abtrag gem\xE4\xDF UBA 17/05",
    qs3: "Regenwasserreinigung oder UBA-Abtragnachweis",
    qs4: "Regenwasserreinigung oder UBA-Abtragnachweis",
    artDokumentation: "Ausz\xFCge aus LVs, Konstruktionspl\xE4nen und Entw\xE4sserungskonzept",
    geltungsbereich: "Titanzink-, Kupfer- und Zinkblechd\xE4cher/-fassaden"
  },
  {
    id: "qng-12.1",
    nr: "12.1",
    standardCode: "QNG",
    kategorie: "12. D\xE4mmstoffe",
    bauteil: "Kunstschaum-D\xE4mmstoffplatten & Spritzsch\xE4ume (EPS, XPS, PUR, PIR)",
    anwendungsbereich: "D\xE4mmung an Wand, Fassade, Dach, Boden, Kellerdecken, PUR-Rohrschalen",
    betrachteteStoffe: "Halogenierte Treibmittel / SVHC: HBCD, TCEP / Emissionen",
    bezugsnorm: "Montrealer Protokoll / 517/2014/EU / POP-VO / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Frei von halogenierten Treibmitteln, EPS/XPS: HBCD \u2264 0,10 %, PUR/PIR: TCEP \u2264 0,10 %, Phenolharz/UF: AgBB-Schema",
    qs3: "Frei von halogenierten Treibmitteln, HBCD \u2264 0,10 %, TCEP \u2264 0,10 %, AgBB-Schema",
    qs4: "Frei von halogenierten Treibmitteln, HBCD \u2264 0,10 %, TCEP \u2264 0,10 %, AgBB-Schema",
    artDokumentation: "TD, ETA/Gutachten MVV TB D3, abZ, Herstellererkl\xE4rung",
    geltungsbereich: "EPS, XPS, PUR, PIR D\xE4mmplatten und Rohrschalen"
  },
  {
    id: "qng-12.2",
    nr: "12.2",
    standardCode: "QNG",
    kategorie: "12. D\xE4mmstoffe",
    bauteil: "Flexible Kunstschaum-D\xE4mmstoffe f\xFCr die Haustechnik",
    anwendungsbereich: "EPDM-Kautschuk, PE, Polyolefin f\xFCr RLT-Kan\xE4le, Rohrd\xE4mmung W\xE4rme/K\xE4lte",
    betrachteteStoffe: "Halogenierte Treibmittel / Chlorparaffine (SCCP, MCCP) / PBB / PBDE",
    bezugsnorm: "Montrealer Protokoll / 517/2014/EU / POP-VO",
    qs1: "Dokumentation",
    qs2: "Frei von halogenierten Treibmitteln, SCCP, MCCP, PBB und PBDE \u2264 0,10 %",
    qs3: "Frei von halogenierten Treibmitteln, SCCP, MCCP, PBB, PBDE \u2264 0,10 %",
    qs4: "Frei von halogenierten Treibmitteln, SCCP, MCCP, PBB, PBDE \u2264 0,10 %",
    artDokumentation: "TD, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Kautschuk- und PE-Rohrd\xE4mmung der Haustechnik"
  },
  {
    id: "qng-12.3",
    nr: "12.3",
    standardCode: "QNG",
    kategorie: "12. D\xE4mmstoffe",
    bauteil: "D\xE4mmstoffe aus K\xFCnstlichen Mineralfasern (KMF)",
    anwendungsbereich: "Alle D\xE4mmstoffe aus Glaswolle und Steinwolle",
    betrachteteStoffe: "Gef\xE4hrliche Stoffe / Emissionen / Biobest\xE4ndigkeit",
    bezugsnorm: "CLP-VO 1272/2008/EG / GefStoffV / RAL-G\xFCtezeichen Mineralwolle",
    qs1: "Dokumentation",
    qs2: "RAL-G\xFCtezeichen \u201EErzeugnisse aus Mineralwolle\u201C (Freizeichnungskriterium KI \u2265 40)",
    qs3: "RAL-G\xFCtezeichen Mineralwolle",
    qs4: "RAL-G\xFCtezeichen Mineralwolle",
    artDokumentation: "RAL-G\xFCtezeichen Zertifikat",
    geltungsbereich: "Glaswolle- und Steinwolle-D\xE4mmstoffe"
  },
  {
    id: "qng-12.4",
    nr: "12.4",
    standardCode: "QNG",
    kategorie: "12. D\xE4mmstoffe",
    bauteil: "D\xE4mmstoffe aus nachwachsenden Rohstoffen",
    anwendungsbereich: "Holzfasern, Holzwolle, Zellulose, Hanf, Jute, Schafwolle in Wand, Decke, Dach",
    betrachteteStoffe: "Gef\xE4hrliche Stoffe / SVHC: Borverbindungen / Biozide",
    bezugsnorm: "REACH 1907/2006/EG / DE-UZ 132",
    qs1: "Dokumentation",
    qs2: "Reproduktionstoxische Borverbindungen \u2264 0,10 %, Deklaration biozider Wirkstoffe",
    qs3: "Borverbindungen \u2264 0,10 %, Deklaration Biozide",
    qs4: "Borverbindungen \u2264 0,10 %, Deklaration Biozide",
    artDokumentation: "TD, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Naturd\xE4mmstoffe (Holzfaser, Zellulose, Hanf, Jute)"
  },
  {
    id: "qng-12.5",
    nr: "12.5",
    standardCode: "QNG",
    kategorie: "12. D\xE4mmstoffe",
    bauteil: "Ortsch\xE4ume (PUR, UF) in Innenr\xE4umen & Geb\xE4udeh\xFClle",
    anwendungsbereich: "Montage von T\xFCren, Fenstern, Hohlraumd\xE4mmung (ausgenommen WDVS-Fugen)",
    betrachteteStoffe: "Halogenierte Treibmittel / Formaldehyd / Chlorparaffine / TCEP",
    bezugsnorm: "Montrealer Protokoll / 517/2014/EU / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Frei von halogenierten Treibmitteln, Kein UF-Schaum, TCEP und Chlorparaffine \u2264 0,10 %",
    qs3: "Frei von halogenierten Treibmitteln, Kein UF-Schaum, TCEP/Chlorparaffine \u2264 0,10 %",
    qs4: "Frei von halogenierten Treibmitteln, Kein UF-Schaum, TCEP/Chlorparaffine \u2264 0,10 %",
    artDokumentation: "TD, SDB, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Fenstersch\xE4ume und PU-Montagesch\xE4ume"
  },
  {
    id: "qng-13.1",
    nr: "13.1",
    standardCode: "QNG",
    kategorie: "13. Haustechnik",
    bauteil: "Installationen Elektro, IT und MSR-Technik aus Kunststoff",
    anwendungsbereich: "Kabel, Leitungen, Leerrohre, Kabelkan\xE4le, Kabelrinnen aus Kunststoff",
    betrachteteStoffe: "SVHC: Phthalat-Weichmacher / PBB / PBDE / Blei / Cadmium",
    bezugsnorm: "POP-VO / 1907/2006/EG / RoHS 2015/863/EU",
    qs1: "Dokumentation",
    qs2: "Reproduktionstoxische Phthalat-Weichmacher \u2264 0,10 %, PBB, PBDE, Blei und Cadmium \u2264 0,10 %",
    qs3: "Phthalate \u2264 0,10 %, PBB, PBDE, Pb, Cd \u2264 0,10 %",
    qs4: "Phthalate \u2264 0,10 %, PBB, PBDE, Pb, Cd \u2264 0,10 %",
    artDokumentation: "TD, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Elektrokabel, Kunststoffkan\xE4le, Leerrohre"
  },
  {
    id: "qng-13.2",
    nr: "13.2",
    standardCode: "QNG",
    kategorie: "13. Haustechnik",
    bauteil: "Brandschottungen Innen & Au\xDFen",
    anwendungsbereich: "Brandschutzspachtelmassen, Brandschutzcoatings f\xFCr Kabel, Brandschutzsilikone",
    betrachteteStoffe: "Chlorparaffine / PBB / PBDE / SVHC: TCEP",
    bezugsnorm: "POP-VO / 1907/2006/EG",
    qs1: "Dokumentation",
    qs2: "Chlorparaffine, PBB, PBDE, TCEP \u2264 0,10 %",
    qs3: "Chlorparaffine, PBB, PBDE, TCEP \u2264 0,10 %",
    qs4: "Chlorparaffine, PBB, PBDE, TCEP \u2264 0,10 %",
    artDokumentation: "TD, SDB, Herstellererkl\xE4rung zu Inhaltsstoffen",
    geltungsbereich: "Kabelschottungen, Rohrabschottungen, Brandschutzmassen"
  },
  {
    id: "qng-13.3",
    nr: "13.3",
    standardCode: "QNG",
    kategorie: "13. Haustechnik",
    bauteil: "K\xE4ltemittel in RLT-Anlagen & W\xE4rmepumpen",
    anwendungsbereich: "RLT-Anlagen mit K\xE4ltetechnik und W\xE4rmepumpenerzeuger",
    betrachteteStoffe: "Halogenierte K\xE4ltemittel / F-Gase",
    bezugsnorm: "EU F-Gase-Verordnung 517/2014/EU / AMEV K\xE4lte 2017",
    qs1: "Dokumentation",
    qs2: "Einsatz nat\xFCrlicher K\xE4ltemittel gem\xE4\xDF AMEV K\xE4lte 2017 Tab. 4 oder als zukunftssicher bis 2030 eingestufte K\xE4ltemittel Tab. 3",
    qs3: "Nat\xFCrliche K\xE4ltemittel AMEV Tab. 4 oder zukunftssicher AMEV Tab. 3",
    qs4: "Nat\xFCrliche K\xE4ltemittel AMEV Tab. 4 oder zukunftssicher AMEV Tab. 3",
    artDokumentation: "TD des K\xE4lteerzeugers und K\xE4ltemittels, SDB K\xE4ltemittel, Auszug aus LV",
    geltungsbereich: "K\xE4ltemaschinen, Klimager\xE4te und W\xE4rmepumpen"
  }
];
var DEFAULT_BNB_MATRIX = [
  {
    id: "bnb-pos0",
    nr: "0",
    standardCode: "BNB",
    kategorie: "1. \xDCbergreifend",
    bauteil: "Besonders besorgniserregende Stoffe (SVHC) - Alle Bauprodukte",
    anwendungsbereich: "Alle in Anlage 1 genannten Bauprodukte und Gemische",
    betrachteteStoffe: "SVHC gem\xE4\xDF REACH-Kandidatenliste (> 0,1 % w/w)",
    bezugsnorm: "REACH-Verordnung 1907/2006/EG",
    qs1: "QN 1 (10 Pkt): Deklaration enthaltener SVHC > 0,1 %",
    qs2: "QN 2 (25 Pkt): SVHC \u2264 0,1 % w/w",
    qs3: "QN 3 (50 Pkt): SVHC \u2264 0,1 % w/w",
    qs4: "QN 4 (75 Pkt): SVHC \u2264 0,1 % w/w",
    artDokumentation: "SDB, Herstellerauskunft REACH, Leistungserkl\xE4rung zur CE-Kennzeichnung",
    geltungsbereich: "Alle Bauprodukte"
  },
  {
    id: "bnb-pos1",
    nr: "1",
    standardCode: "BNB",
    kategorie: "2. Bodenbel\xE4ge",
    bauteil: "Textile Bodenbel\xE4ge (Teppiche)",
    anwendungsbereich: "Teppichb\xF6den im Innenraum",
    betrachteteStoffe: "VOC / gef\xE4hrliche Stoffe / Biozide",
    bezugsnorm: "RAL-UZ 128 / GuT-G\xFCtesiegel",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): RAL-UZ 128 oder GuT-G\xFCtesiegel",
    qs3: "QN 3 (50 Pkt): RAL-UZ 128 oder GuT-G\xFCtesiegel",
    qs4: "QN 4 (75 Pkt): RAL-UZ 128 oder GuT-G\xFCtesiegel",
    artDokumentation: "PDB, TM, Umweltzeichen (Blauer Engel, GuT), EPD",
    geltungsbereich: "Textile Bel\xE4ge"
  },
  {
    id: "bnb-pos2a",
    nr: "2a",
    standardCode: "BNB",
    kategorie: "2. Bodenbel\xE4ge",
    bauteil: "Elastische Bodenbel\xE4ge (Kautschuk, Polyolefine, Kork, Linoleum, PVC)",
    anwendungsbereich: "Elastische Bodenbel\xE4ge mit/ohne Unterlage",
    betrachteteStoffe: "VOC / Phthalate / Schwermetalle (Cadmium, Blei)",
    bezugsnorm: "AgBB-Schema / RAL-UZ 120",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): AgBB-Schema, Phthalate < 0,1 %, keine Cadmium-/Bleistabilisatoren",
    qs3: "QN 3 (50 Pkt): AgBB-Schema, Phthalate < 0,1 %, keine Cadmium-/Bleistabilisatoren",
    qs4: "QN 4 (75 Pkt): RAL-UZ 120 (Keine Verwendung von PVC)",
    artDokumentation: "Emissions-Pr\xFCfbericht, abZ Z-156.602 bis Z-156.613, Blauer Engel",
    geltungsbereich: "Elastische Bel\xE4ge"
  },
  {
    id: "bnb-pos2b",
    nr: "2b",
    standardCode: "BNB",
    kategorie: "2. Bodenbel\xE4ge",
    bauteil: "Bodenbel\xE4ge aus Holzwerkstoffen & Laminate",
    anwendungsbereich: "Laminate, Parkette, Holzfu\xDFb\xF6den, Bambusparkette",
    betrachteteStoffe: "VOC / gef\xE4hrliche Stoffe",
    bezugsnorm: "AgBB-Schema / RAL-UZ 176",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): AgBB-Schema, f\xFCr Beschichtungen gilt Pos. 3b",
    qs3: "QN 3 (50 Pkt): AgBB-Schema, f\xFCr Beschichtungen gilt Pos. 3b",
    qs4: "QN 4 (75 Pkt): RAL-UZ 176 (Blauer Engel)",
    artDokumentation: "Emissions-Pr\xFCfbericht, abZ Gruppe Z-156.606 ff., Blauer Engel, EPD",
    geltungsbereich: "Holzbel\xE4ge"
  },
  {
    id: "bnb-pos41",
    nr: "41",
    standardCode: "BNB",
    kategorie: "3. Wandbel\xE4ge & Bauplatten",
    bauteil: "Beschichtete und unbeschichtete Holzwerkstoffe",
    anwendungsbereich: "Span-, Tischler-, Faser-, MDF-, Sperrholz-, Massivholz-, OSB-Platten",
    betrachteteStoffe: "VOC / Formaldehyd / gef\xE4hrliche Stoffe",
    bezugsnorm: "DIN EN 13986 / RAL-UZ 76",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Flammhemmend ausger\xFCstet Pos. 46a",
    qs3: "QN 3 (50 Pkt): Formaldehyd-Ausgleichskonzentration < 0,065 ppm (0,080 mg/m\xB3, E1plus)",
    qs4: "QN 4 (75 Pkt): Formaldehyd < 0,05 ppm (0,062 mg/m\xB3)",
    artDokumentation: "PDB, TM, Formaldehyd-Pr\xFCfbericht, Blauer Engel DE-UZ 76",
    geltungsbereich: "Konstruktiver Holzbau & Innenausbau"
  },
  {
    id: "bnb-pos45",
    nr: "45",
    standardCode: "BNB",
    kategorie: "3. Wandbel\xE4ge & Bauplatten",
    bauteil: "Flammhemmend ausger\xFCstete Gewebe und Vliese",
    anwendungsbereich: "Glasfasergewebe, Malervlies an Wand und Decke",
    betrachteteStoffe: "Chlorparaffine / PBDE / TCEP < 0,1 %",
    bezugsnorm: "BNB Kriterium 1.1.6 Anlage 2",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Chlorparaffine, PBDE, TCEP < 0,1 %",
    qs3: "QN 3 (50 Pkt): Chlorparaffine, PBDE, TCEP < 0,1 %",
    qs4: "QN 4 (75 Pkt): Chlorparaffine, PBDE, TCEP < 0,1 %",
    artDokumentation: "Herstellererkl\xE4rung, Analysenergebnisse, SDB",
    geltungsbereich: "Malervlies und Glasgewebe"
  },
  {
    id: "bnb-pos3a",
    nr: "3a",
    standardCode: "BNB",
    kategorie: "4. Oberfl\xE4chenbeschichtungen (Holz/Metall/Kunststoff)",
    bauteil: "Lacke, Lasuren, Beizen auf nicht mineralischen Oberfl\xE4chen (Holz, Metall)",
    anwendungsbereich: "Vor-Ort und werkseitige Beschichtungen auf Holz, Metallen, Kunststoffen",
    betrachteteStoffe: "VOC / Schwermetalle (Blei, Cadmium, Chrom-VI) / Phthalate",
    bezugsnorm: "Decopaint Kat. D, E, F / RAL-UZ 12a",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Wb oder Lb: 130 g/l < VOC > 300 g/l, keine Blei-, Cd-, CrVI-Pigmente, Phthalate < 0,1 %, AgBB",
    qs3: "QN 3 (50 Pkt): Nur Wb: 100 g/l < VOC > 130 g/l, keine Blei/Cd/CrVI, Phthalate < 0,1 %, AgBB",
    qs4: "QN 4 (75 Pkt): Nur Wb: VOC < 100 g/l, schwermetallfrei, Phthalate < 0,1 %, AgBB",
    artDokumentation: "PDB, TM mit Decopaint-L\xF6semittelgehalt, SDB, Blauer Engel",
    geltungsbereich: "Lackierungen und Lasuren auf Holz/Metall/Kunststoff"
  },
  {
    id: "bnb-pos3b",
    nr: "3b",
    standardCode: "BNB",
    kategorie: "4. Oberfl\xE4chenbeschichtungen (Holz/Metall/Kunststoff)",
    bauteil: "Beschichtungen auf Holzfu\xDFb\xF6den & Parkett",
    anwendungsbereich: "Parkettlacke, Beizen, Grundierungen auf Parkett und Holztreppen",
    betrachteteStoffe: "VOC / Schwermetalle / Phthalate / GISCODE",
    bezugsnorm: "AgBB-Schema / GISCODE W1-W3/DD+ / RAL-UZ 12a",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): AgBB, GISCODE W1, W2+, W1/DD, W2/DD+, W3+, W3/DD+, schwermetallfrei",
    qs3: "QN 3 (50 Pkt): AgBB, GISCODE W1-W3/DD+, schwermetallfrei",
    qs4: "QN 4 (75 Pkt): AgBB, GISCODE W1, W2+, W1/DD, W2/DD+, schwermetallfrei",
    artDokumentation: "Emissions-Pr\xFCfbericht abZ Z-157.10, PDB, TM mit GISCODE, SDB",
    geltungsbereich: "Holzboden-Versiegelungen"
  },
  {
    id: "bnb-pos23",
    nr: "23",
    standardCode: "BNB",
    kategorie: "4. Oberfl\xE4chenbeschichtungen (Holz/Metall/Kunststoff)",
    bauteil: "\xD6le und Wachse f\xFCr Holzoberfl\xE4chen",
    anwendungsbereich: "Parkett, Treppen, Holzverkleidungen, T\xFCren",
    betrachteteStoffe: "VOC / AgBB / GISCODE \xD610/\xD620/\xD640",
    bezugsnorm: "AgBB-Schema / GISCODE \xD610-\xD640",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): AgBB-Schema, GISCODE \xD610, \xD620 oder \xD640",
    qs3: "QN 3 (50 Pkt): AgBB-Schema, GISCODE \xD610 oder \xD620",
    qs4: "QN 4 (75 Pkt): AgBB-Schema, GISCODE \xD610 oder \xD620",
    artDokumentation: "Emissions-Pr\xFCfbericht abZ Z-157.10, PDB, TM, SDB",
    geltungsbereich: "\xD6le und Wachse"
  },
  {
    id: "bnb-pos44",
    nr: "44",
    standardCode: "BNB",
    kategorie: "4. Oberfl\xE4chenbeschichtungen (Holz/Metall/Kunststoff)",
    bauteil: "Flammhemmende Oberfl\xE4chenbeschichtungen & Spachtelmassen",
    anwendungsbereich: "Brandschutzspachtelmassen, Brandschutzcoatings f\xFCr Kabel, Brandschutzsilikone",
    betrachteteStoffe: "Chlorparaffine / PBB / PBDE / TCEP < 0,1 %",
    bezugsnorm: "BNB Kriterium 1.1.6 Anlage 2",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Chlorparaffine, PBB, PBDE, TCEP < 0,1 %",
    qs3: "QN 3 (50 Pkt): Chlorparaffine, PBB, PBDE, TCEP < 0,1 %",
    qs4: "QN 4 (75 Pkt): Chlorparaffine, PBB, PBDE, TCEP < 0,1 %",
    artDokumentation: "Herstellererkl\xE4rung, Analysenergebnisse, SDB",
    geltungsbereich: "Brandschutzbeschichtungen"
  },
  {
    id: "bnb-pos4",
    nr: "4",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Spachtelmassen, Grundierungen & Betonschutz auf mineralischen Fl\xE4chen",
    anwendungsbereich: "Beton, Mauerwerk, M\xF6rtel, Putz, Gipskarton im Innenbereich",
    betrachteteStoffe: "VOC / L\xF6semittelfreiheit / Weichmacherfreiheit (VdL-RL01)",
    bezugsnorm: "VdL-RL01 Punkt 4.2.4 / Decopaint Kat. G+H",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Nur wasserbasiert: VOC < 30 g/l",
    qs3: "QN 3 (50 Pkt): Nur wasserbasiert: VOC < 30 g/l",
    qs4: "QN 4 (75 Pkt): L\xF6semittelfrei und weichmacherfrei gem\xE4\xDF VdL-RL01",
    artDokumentation: "PDB, TM mit Angaben nach Decopaint-RL, SDB",
    geltungsbereich: "Mineralische Spachtel & Grundierungen"
  },
  {
    id: "bnb-pos5",
    nr: "5",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Innenwand- und Deckenfarben",
    anwendungsbereich: "Beton, Mauerwerk, Putz, Gipskarton, Tapeten, Vliese",
    betrachteteStoffe: "VOC / Biozide / Schwermetalle / L\xF6semittel- & Weichmacherfreiheit",
    bezugsnorm: "VdL-RL01 Punkt 4.2.4 / RAL-UZ 102",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): L\xF6semittel- und weichmacherfrei gem\xE4\xDF VdL-RL01",
    qs3: "QN 3 (50 Pkt): RAL-UZ 102 (Blauer Engel)",
    qs4: "QN 4 (75 Pkt): RAL-UZ 102 (Blauer Engel)",
    artDokumentation: "PDB, TM mit Angaben nach Decopaint-RL, SDB, Blauer Engel",
    geltungsbereich: "Innenwand- und Deckenfarben"
  },
  {
    id: "bnb-pos6a",
    nr: "6a",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Au\xDFenwandfarben inkl. Grundierungen",
    anwendungsbereich: "Beton, Mauerwerk, Putz, Fassadentapeten Au\xDFen",
    betrachteteStoffe: "VOC / Biozide / Schwermetalle",
    bezugsnorm: "Decopaint Kat. C",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Nur Wb: 30 g/l < VOC < 40 g/l, keine Blei/Cd/CrVI-Pigmente",
    qs3: "QN 3 (50 Pkt): Nur Wb: 20 g/l < VOC < 30 g/l, keine Blei/Cd/CrVI-Pigmente",
    qs4: "QN 4 (75 Pkt): Nur Wb: 20 g/l < VOC < 30 g/l, kein Einsatz biozider Wirkstoffe au\xDFer Topfkonservierern",
    artDokumentation: "PDB, TM mit Angaben nach Decopaint-RL, SDB",
    geltungsbereich: "Fassadenfarben"
  },
  {
    id: "bnb-pos7",
    nr: "7",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Nicht filmbildende Impr\xE4gnierungen",
    anwendungsbereich: "Natur- und Betonwerksteinbodenbel\xE4ge im Innenbereich",
    betrachteteStoffe: "VOC / GISCODE GH 10",
    bezugsnorm: "GISCODE GH 10",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): GISCODE GH 10 (entaromatisiert)",
    qs3: "QN 3 (50 Pkt): GISCODE GH 10 (entaromatisiert)",
    qs4: "QN 4 (75 Pkt): GISCODE GH 10 (entaromatisiert)",
    artDokumentation: "PDB, TM mit GISCODE, SDB",
    geltungsbereich: "Stein-Impr\xE4gnierungen"
  },
  {
    id: "bnb-pos11",
    nr: "11",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Epoxidharz-, PU-, Dispersions- & PMMA-Beschichtungen",
    anwendungsbereich: "Past\xF6se oder fl\xFCssige Abdichtungen in Feuchtr\xE4umen",
    betrachteteStoffe: "VOC / GISCODE / EMICODE",
    bezugsnorm: "GISCODE / EMICODE EC1/EC1PLUS",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): GISCODE D1, RE0, RE1, RU0,5, RU1, PU10, PU20 oder RMA10",
    qs3: "QN 3 (50 Pkt): GISCODE D1, RE0, RE1, RU0,5, RU1, PU10, PU20 oder RMA10",
    qs4: "QN 4 (75 Pkt): EMICODE EC1 oder EC1PLUS",
    artDokumentation: "PDB, TM mit GISCODE, SDB, EMICODE Zertifikat",
    geltungsbereich: "Verbundabdichtungen im Feuchtbereich"
  },
  {
    id: "bnb-pos17",
    nr: "17",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Reaktive PU-Produkte (Versiegelungen)",
    anwendungsbereich: "Flie\xDFbeschichtungen auf mineralischen Fl\xE4chen",
    betrachteteStoffe: "VOC / AgBB / GISCODE PU10/PU20",
    bezugsnorm: "AgBB-Schema / GISCODE PU10",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): AgBB-Schema, GISCODE PU10 oder PU20",
    qs3: "QN 3 (50 Pkt): AgBB-Schema, GISCODE PU10 oder PU20",
    qs4: "QN 4 (75 Pkt): AgBB-Schema, GISCODE PU10",
    artDokumentation: "Emissions-Pr\xFCfbericht abZ Z-156.605, PDB, TM, SDB",
    geltungsbereich: "PU-Versiegelungen"
  },
  {
    id: "bnb-pos19",
    nr: "19",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Epoxidharzbeschichtungen (Versiegelungen)",
    anwendungsbereich: "Flie\xDFbeschichtungen auf mineralischen Oberfl\xE4chen",
    betrachteteStoffe: "VOC / AgBB / GISCODE RE1/RE0/RE2",
    bezugsnorm: "AgBB-Schema / GISCODE RE0/RE1",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): AgBB-Schema, GISCODE RE1, RE0, RE2",
    qs3: "QN 3 (50 Pkt): AgBB-Schema, GISCODE RE1, RE0, RE2",
    qs4: "QN 4 (75 Pkt): AgBB-Schema, GISCODE RE1, RE0",
    artDokumentation: "Emissions-Pr\xFCfbericht abZ Z-156.605, PDB, TM, SDB",
    geltungsbereich: "Epoxidharzbeschichtungen"
  },
  {
    id: "bnb-pos20a",
    nr: "20a",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Epoxidharz- & PU-Beschichtungen mit besonderen Anforderungen (Industrie/Garage)",
    anwendungsbereich: "Industrieb\xF6den, Parkfl\xE4chen, Tiefgaragen OS8/OS11",
    betrachteteStoffe: "VOC / GISCODE PU10-PU60 / RE0-RE2",
    bezugsnorm: "GISCODE PU10-PU60 / RE0-RE2",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): GISCODE PU10, PU20, PU40, PU60, RE1, RE0, RE2",
    qs3: "QN 3 (50 Pkt): GISCODE PU10, PU20, PU40, PU60, RE1, RE0, RE2",
    qs4: "QN 4 (75 Pkt): GISCODE PU10, PU40, PU60, RE1, RE0",
    artDokumentation: "PDB, TM mit GISCODE, SDB",
    geltungsbereich: "Parkdeck- & Tiefgaragenbeschichtungen"
  },
  {
    id: "bnb-pos20b",
    nr: "20b",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "PMMA-Fl\xFCssigkunststoff-Beschichtungen",
    anwendungsbereich: "Industrieb\xF6den, Parkfl\xE4chen, Dachabdichtung, Sockel",
    betrachteteStoffe: "VOC / GISCODE RMA10",
    bezugsnorm: "GISCODE RMA10",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): keine Anforderungen",
    qs3: "QN 3 (50 Pkt): keine Anforderungen",
    qs4: "QN 4 (75 Pkt): GISCODE RMA10",
    artDokumentation: "PDB, TM mit GISCODE, SDB",
    geltungsbereich: "PMMA-Schnellharzabdichtungen"
  },
  {
    id: "bnb-pos35",
    nr: "35",
    standardCode: "BNB",
    kategorie: "5. Mineralische Oberfl\xE4chen",
    bauteil: "Fassadenputze Au\xDFenbereich",
    anwendungsbereich: "Beton, Mauerwerk, M\xF6rtel, WDVS Au\xDFen",
    betrachteteStoffe: "Biozide Wirkstoffe",
    bezugsnorm: "Biozid-VO 528/2012/EG",
    qs1: "QN 1 (10 Pkt): Dokumentation + Deklaration biozider Wirkstoffe",
    qs2: "QN 2 (25 Pkt): Deklaration biozider Wirkstoffe",
    qs3: "QN 3 (50 Pkt): Deklaration biozider Wirkstoffe",
    qs4: "QN 4 (75 Pkt): Kein Einsatz biozider Wirkstoffe au\xDFer Topfkonservierern",
    artDokumentation: "PDB, SDB, Blauer Engel, CE-Leistungserkl\xE4rung",
    geltungsbereich: "Fassadenputze"
  },
  {
    id: "bnb-pos6b",
    nr: "6b",
    standardCode: "BNB",
    kategorie: "6. Kleb- und Dichtstoffe",
    bauteil: "Dispersions- und PU-Klebstoffe Au\xDFenbereich",
    anwendungsbereich: "Verklebung gesch\xE4umter D\xE4mmstoffe an Fassade, Flachdach, Tapeten Au\xDFen",
    betrachteteStoffe: "VOC / Chlorparaffine / PBDE / TCEP < 0,1 %",
    bezugsnorm: "BNB Kriterium 1.1.6 Anlage 2",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): VOC < 40 g/l, Chlorparaffine < 0,1 %, PU-Kleber: PBDE, TCEP < 0,1 %",
    qs3: "QN 3 (50 Pkt): VOC < 40 g/l, Chlorparaffine < 0,1 %, PU-Kleber: PBDE, TCEP < 0,1 %",
    qs4: "QN 4 (75 Pkt): VOC < 40 g/l, Chlorparaffine < 0,1 %, PU-Kleber: PBDE, TCEP < 0,1 %",
    artDokumentation: "PDB, TM, SDB, Herstellererkl\xE4rung",
    geltungsbereich: "D\xE4mmstoff- & Au\xDFenklebstoffe"
  },
  {
    id: "bnb-pos8",
    nr: "8",
    standardCode: "BNB",
    kategorie: "6. Kleb- und Dichtstoffe",
    bauteil: "Fugendichtstoffe & Klebstoffe (PU, SMP, Acrylat, Silikon) Innen",
    anwendungsbereich: "Punkt- und linienf\xF6rmige Verklebungen und Abdichtungen im Innenraum",
    betrachteteStoffe: "VOC / Chlorparaffine / TCEP / Silikone (amin-/oximfrei) / EMICODE",
    bezugsnorm: "RAL-UZ 123 / EMICODE EC1/EC1PLUS",
    qs1: "QN 1 (10 Pkt): Dokumentation + Deklaration biozider Wirkstoffe",
    qs2: "QN 2 (25 Pkt): Chlorparaffine < 0,1 %, PU-Kleber: GISCODE PU10/PU20, TCEP < 0,1 %",
    qs3: "QN 3 (50 Pkt): Chlorparaffine < 0,1 %, PU-Kleber: GISCODE PU10/PU20, TCEP < 0,1 %",
    qs4: "QN 4 (75 Pkt): keine amin- oder oximvernetzenden Silikone, RAL-UZ 123 oder EMICODE EC1/EC1PLUS, Chlorparaffine < 0,1 %, PU: TCEP < 0,1 %",
    artDokumentation: "PDB, TM mit GISCODE, SDB, EMICODE Zertifikat",
    geltungsbereich: "Fugendichtstoffe & Kleber Innenraum"
  },
  {
    id: "bnb-pos9",
    nr: "9",
    standardCode: "BNB",
    kategorie: "6. Kleb- und Dichtstoffe",
    bauteil: "Kleb- und Dichtstoffe f\xFCr Luftdichtigkeit an Fassade & Fenstern",
    anwendungsbereich: "Punkt- und linienf\xF6rmige Verklebungen zur Luftdichtheit an Fassade/Fenstern",
    betrachteteStoffe: "VOC / Chlorparaffine / TCEP / EMICODE",
    bezugsnorm: "EMICODE EC1/EC1PLUS",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Chlorparaffine < 0,1 %, PU-Kleber: TCEP < 0,1 %",
    qs3: "QN 3 (50 Pkt): Chlorparaffine < 0,1 %, PU-Kleber: TCEP < 0,1 %",
    qs4: "QN 4 (75 Pkt): Chlorparaffine < 0,1 %, EMICODE EC1/EC1PLUS oder VOC < 10 g/l, PU: TCEP < 0,1 %",
    artDokumentation: "PDB, TM, SDB, EMICODE Lizenzurkunde",
    geltungsbereich: "Luftdichtheitsanschlusskleber"
  },
  {
    id: "bnb-pos10a",
    nr: "10a",
    standardCode: "BNB",
    kategorie: "7. Verlegewerkstoffe",
    bauteil: "Verlegewerkstoffe f\xFCr keramische Wand- und Bodenfliesen",
    anwendungsbereich: "Grundierungen, Voranstriche, Spachtelmassen, Fliesenkleber",
    betrachteteStoffe: "VOC / GISCODE / EMICODE / RAL-UZ 113",
    bezugsnorm: "GISCODE D1, RU0,5, RU1, RE1, RS10 / EMICODE / RAL-UZ 113",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): mineralische Fliesenkleber oder GISCODE D1, RU0,5, RU1, RE1, RS10",
    qs3: "QN 3 (50 Pkt): mineralische Fliesenkleber oder EMICODE EC1/EC1PLUS",
    qs4: "QN 4 (75 Pkt): RAL-UZ 113 oder EMICODE EC1/EC1PLUS",
    artDokumentation: "PDB, TM mit GISCODE, SDB, EMICODE, Blauer Engel",
    geltungsbereich: "Fliesenverlegewerkstoffe"
  },
  {
    id: "bnb-pos10b",
    nr: "10b",
    standardCode: "BNB",
    kategorie: "7. Verlegewerkstoffe",
    bauteil: "Verlegewerkstoffe f\xFCr Wand- und Bodenbel\xE4ge (ohne Fliesen)",
    anwendungsbereich: "Grundierungen, Voranstriche, Spachtelmassen, Belagsklebstoffe",
    betrachteteStoffe: "VOC / EMICODE / RAL-UZ 113",
    bezugsnorm: "EMICODE EC1/EC1PLUS / RAL-UZ 113",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): EMICODE EC1 oder EC1PLUS",
    qs3: "QN 3 (50 Pkt): EMICODE EC1 oder EC1PLUS",
    qs4: "QN 4 (75 Pkt): RAL-UZ 113 (Blauer Engel)",
    artDokumentation: "PDB, TM, SDB, EMICODE, Blauer Engel",
    geltungsbereich: "Bodenbelagsklebstoffe und Spachtelmassen"
  },
  {
    id: "bnb-pos12",
    nr: "12",
    standardCode: "BNB",
    kategorie: "7. Verlegewerkstoffe",
    bauteil: "Tapetenkleber",
    anwendungsbereich: "Klebstoffe f\xFCr Tapeten im Innenraum",
    betrachteteStoffe: "VOC / GISCODE D1 / VdL-RL01",
    bezugsnorm: "GISCODE D1 / VdL-RL01 4.2.4",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Pulverprodukte oder GISCODE D1",
    qs3: "QN 3 (50 Pkt): Pulverprodukte oder GISCODE D1",
    qs4: "QN 4 (75 Pkt): Pulverprodukte oder GISCODE D1",
    artDokumentation: "PDB, TM mit GISCODE, SDB",
    geltungsbereich: "Tapetenkleister"
  },
  {
    id: "bnb-pos13",
    nr: "13",
    standardCode: "BNB",
    kategorie: "8. Metallbleche & Korrosionsschutz",
    bauteil: "Korrosionsschutz C2 hoch (Tragende/nichttragende Metalle > 3 mm)",
    anwendungsbereich: "Atriumkonstruktionen, Br\xFCcken, Metallbauteile Innen",
    betrachteteStoffe: "VOC-Gehalt (Lb/Wb)",
    bezugsnorm: "Decopaint Kat. I+J",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): wenn Lb < 300 g/l",
    qs3: "QN 3 (50 Pkt): nur Wb < 140 g/l",
    qs4: "QN 4 (75 Pkt): nur Wb < 140 g/l",
    artDokumentation: "PDB, TM mit Angaben nach Decopaint-RL, SDB",
    geltungsbereich: "Korrosionsschutz C2"
  },
  {
    id: "bnb-pos14",
    nr: "14",
    standardCode: "BNB",
    kategorie: "8. Metallbleche & Korrosionsschutz",
    bauteil: "Korrosionsschutz C3 hoch (werkseitig grundiert, bauseitig endbeschichtet)",
    anwendungsbereich: "Tragende Metallbauteile > 3 mm (Br\xFCcken, Atrien)",
    betrachteteStoffe: "VOC-Gehalt des Gesamtsystems (g/m\xB2)",
    bezugsnorm: "Decopaint-Richtlinie / TA-Luft",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Beschichtungssystem mit VOC < 120 g/m\xB2",
    qs3: "QN 3 (50 Pkt): Beschichtungssystem mit VOC < 90 g/m\xB2",
    qs4: "QN 4 (75 Pkt): Beschichtungssystem mit VOC < 60 g/m\xB2",
    artDokumentation: "PDB, SDB, Herstellererkl\xE4rung mit Angaben zu Gesamtgehalten des Systems",
    geltungsbereich: "Korrosionsschutz C3"
  },
  {
    id: "bnb-pos15",
    nr: "15",
    standardCode: "BNB",
    kategorie: "8. Metallbleche & Korrosionsschutz",
    bauteil: "Korrosionsschutz C4 hoch (werkseitig grundiert, bauseitig endbeschichtet)",
    anwendungsbereich: "Tragende Metallbauteile > 3 mm im Au\xDFenbereich",
    betrachteteStoffe: "VOC-Gehalt des Gesamtsystems (g/m\xB2)",
    bezugsnorm: "Decopaint-Richtlinie / TA-Luft",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Beschichtungssystem mit VOC < 150 g/m\xB2",
    qs3: "QN 3 (50 Pkt): Beschichtungssystem mit VOC < 120 g/m\xB2",
    qs4: "QN 4 (75 Pkt): Beschichtungssystem mit VOC < 90 g/m\xB2",
    artDokumentation: "PDB, SDB, Herstellererkl\xE4rung zum Gesamtsystem",
    geltungsbereich: "Korrosionsschutz C4"
  },
  {
    id: "bnb-pos16",
    nr: "16",
    standardCode: "BNB",
    kategorie: "8. Metallbleche & Korrosionsschutz",
    bauteil: "Korrosionsschutz nicht tragender Metallbauteile (C1/C2)",
    anwendungsbereich: "Treppengel\xE4nder, Zargen, Stahlt\xFCren, Fassadenelemente",
    betrachteteStoffe: "VOC-Gehalt (Lb/Wb)",
    bezugsnorm: "Decopaint Kat. I+J",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): wenn Lb VOC < 300 g/l",
    qs3: "QN 3 (50 Pkt): wenn Lb VOC < 300 g/l",
    qs4: "QN 4 (75 Pkt): nur Wb VOC < 140 g/l",
    artDokumentation: "PDB, TM mit Decopaint-Angaben, SDB",
    geltungsbereich: "Nichttragende Metallbauteile"
  },
  {
    id: "bnb-pos27",
    nr: "27",
    standardCode: "BNB",
    kategorie: "8. Metallbleche & Korrosionsschutz",
    bauteil: "Oberfl\xE4chenveredlung Aluminium- & Edelstahloberfl\xE4chen",
    anwendungsbereich: "Eloxierte Aluminium- und passivierte Edelstahlbleche/Profile",
    betrachteteStoffe: "Schwermetalle (Chrom-VI)",
    bezugsnorm: "Chrom-VI-Freiheit",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): keine besonderen Anforderungen",
    qs3: "QN 3 (50 Pkt): keine besonderen Anforderungen",
    qs4: "QN 4 (75 Pkt): Chrom-VI-oxidfreie Passivierungsmittel",
    artDokumentation: "PDB, TM, Herstellererkl\xE4rung",
    geltungsbereich: "Alu- und Edelstahlbekleidungen"
  },
  {
    id: "bnb-pos30",
    nr: "30",
    standardCode: "BNB",
    kategorie: "8. Metallbleche & Korrosionsschutz",
    bauteil: "Unbeschichtete Kupfer- und Zinkbleche",
    anwendungsbereich: "Dacheindeckung, Dachrinnen, Fassaden direkt bewittert (> 50 m\xB2)",
    betrachteteStoffe: "Schwermetalle (Kupfer, Zink)",
    bezugsnorm: "Leitfaden UBA 17/05",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): keine Anforderungen",
    qs3: "QN 3 (50 Pkt): keine Anforderungen",
    qs4: "QN 4 (75 Pkt): Regenwasserreinigungsanlagen bei Metallfl\xE4chen > 50 m\xB2 bzw. Nachweis Abtrag gem\xE4\xDF UBA 17/05",
    artDokumentation: "Ausz\xFCge aus LVs, Konstruktionspl\xE4nen",
    geltungsbereich: "Kupfer- & Zinkbleche"
  },
  {
    id: "bnb-pos21",
    nr: "21",
    standardCode: "BNB",
    kategorie: "9. Bitumenprodukte",
    bauteil: "Kalt verarbeitete Bitumenbeschichtungen",
    anwendungsbereich: "Dachabdichtungen, Bauwerksabdichtung gegen Erdreich/Feuchte, Bitumendickbeschichtung",
    betrachteteStoffe: "VOC / GISCODE BBP 10/20",
    bezugsnorm: "GISCODE BBP 10 / BBP 20",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): GISCODE BBP 10 oder BBP 20",
    qs3: "QN 3 (50 Pkt): GISCODE BBP 10 oder BBP 20",
    qs4: "QN 4 (75 Pkt): GISCODE BBP 10",
    artDokumentation: "PDB, TM mit GISCODE, SDB",
    geltungsbereich: "Bitumenkaltbeschichtungen"
  },
  {
    id: "bnb-pos22",
    nr: "22",
    standardCode: "BNB",
    kategorie: "9. Bitumenprodukte",
    bauteil: "Bitumenvoranstrich f\xFCr Umkehrd\xE4cher",
    anwendungsbereich: "Bitumin\xF6se Verbundabdichtungen beim Umkehrdach",
    betrachteteStoffe: "VOC / GISCODE BBP 10/20/30",
    bezugsnorm: "GISCODE BBP 10, BBP 20, BBP 30",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): GISCODE BBP 10, BBP 20 oder BBP 30",
    qs3: "QN 3 (50 Pkt): GISCODE BBP 10, BBP 20 oder BBP 30",
    qs4: "QN 4 (75 Pkt): GISCODE BBP 10, BBP 20 oder BBP 30",
    artDokumentation: "PDB, TM mit GISCODE, SDB",
    geltungsbereich: "Umkehrdach-Voranstriche"
  },
  {
    id: "bnb-pos37",
    nr: "37",
    standardCode: "BNB",
    kategorie: "9. Bitumenprodukte",
    bauteil: "Polymerbitumenbahnen f\xFCr Dachabdichtungen",
    anwendungsbereich: "Dachabdichtungen (nicht f\xFCr Gr\xFCnd\xE4cher)",
    betrachteteStoffe: "Biozide / Wurzelschutzmittel (Mecoprop)",
    bezugsnorm: "BNB Kriterium 1.1.6 Pos. 37",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): keine Anforderungen",
    qs3: "QN 3 (50 Pkt): kein Zusatz von durchwurzelungshemmenden Wirkstoffen wie z.B. Mecoprop",
    qs4: "QN 4 (75 Pkt): kein Zusatz von durchwurzelungshemmenden Wirkstoffen wie z.B. Mecoprop",
    artDokumentation: "PDB, TM, Herstellererkl\xE4rung, EPD",
    geltungsbereich: "Polymerbitumenbahnen"
  },
  {
    id: "bnb-pos24",
    nr: "24",
    standardCode: "BNB",
    kategorie: "10. Holzschutzmittel",
    bauteil: "Holzschutzmittel nach DIN 68800-2/3 in feuchten Innenr\xE4umen",
    anwendungsbereich: "Tragende Holzbauteile in ungeheizten Atrien, Schwimmhallen, Auskragungen",
    betrachteteStoffe: "Biozide / BAUA/DIBt-Zulassung",
    bezugsnorm: "DIN 68800-2 und 3 / BAUA / DIBt",
    qs1: "QN 1 (10 Pkt): Deklaration biozider Wirkstoffe + Begleitdokument DIN 68800-2",
    qs2: "QN 2 (25 Pkt): GK 0: konstruktiv. GK 1-3: Zugelassenes Biozidprodukt durch BAUA/DIBt + Pos. 46a",
    qs3: "QN 3 (50 Pkt): GK 0/1: konstruktiv nach DIN 68800-2. GK 2/3: Zugelassenes Biozidprodukt + Pos. 46a",
    qs4: "QN 4 (75 Pkt): GK 0-3: Holzschutz nur konstruktiv nach DIN 68800-2 oder nat\xFCrliche Dauerhaftigkeit DIN EN 350 + Pos. 46a",
    artDokumentation: "LV-Ausz\xFCge, PDB, SDB (GK 1-3), Begleitdokument DIN 68800, BAUA/DIBt-Zulassung",
    geltungsbereich: "Tragende Holzbauteile feucht"
  },
  {
    id: "bnb-pos25",
    nr: "25",
    standardCode: "BNB",
    kategorie: "10. Holzschutzmittel",
    bauteil: "Holzschutzmittel f\xFCr au\xDFenliegende tragende Holzbauteile",
    anwendungsbereich: "Au\xDFenliegende tragende Holzbauteile",
    betrachteteStoffe: "Biozide / BAUA/DIBt-Zulassung",
    bezugsnorm: "DIN 68800-2 und 3 / DIN EN 350",
    qs1: "QN 1 (10 Pkt): Deklaration biozider Wirkstoffe",
    qs2: "QN 2 (25 Pkt): GK 1: konstruktiv. GK 2-4: Zugelassenes Biozidprodukt BAUA/DIBt + Pos. 46a",
    qs3: "QN 3 (50 Pkt): GK 1: konstruktiv. GK 2: konstruktiv / DIN EN 350. GK 3/4: Zugelassenes Biozidprodukt + Pos. 46a",
    qs4: "QN 4 (75 Pkt): GK 1: konstruktiv. GK 2/3: konstruktiv / DIN EN 350. GK 4: Zugelassenes Biozidprodukt + Pos. 46a",
    artDokumentation: "LV-Ausz\xFCge, PDB, SDB (GK 2-4), BAUA/DIBt-Zulassung",
    geltungsbereich: "Tragholz Au\xDFenbereich"
  },
  {
    id: "bnb-pos26",
    nr: "26",
    standardCode: "BNB",
    kategorie: "10. Holzschutzmittel",
    bauteil: "Chemische Impr\xE4gnierung nichttragender Bauteile au\xDFen (Holzfenster)",
    anwendungsbereich: "Holzfenster und nichttragende Holzbauteile au\xDFen",
    betrachteteStoffe: "Biozide / BAUA-Zulassung / RAL-GZ 830",
    bezugsnorm: "BAUA / RAL-GZ 830 / DIN 68800-3",
    qs1: "QN 1 (10 Pkt): Deklaration biozider Wirkstoffe",
    qs2: "QN 2 (25 Pkt): Nur BAUA-zugelassenes Biozidprodukt oder RAL-GZ 830 + Pos. 46a",
    qs3: "QN 3 (50 Pkt): Nur BAUA-zugelassenes Biozidprodukt oder RAL-GZ 830 + Pos. 46a",
    qs4: "QN 4 (75 Pkt): Kein chemischer Holzschutz f\xFCr Fenster (GK 2) und au\xDFenliegende Bauteile (Ausnahme: Fenster GK 3 mit BAUA)",
    artDokumentation: "LV-Ausz\xFCge, Begleitpapiere DIN 68800-3, BAUA-Zulassung, RAL-G\xFCtezeichen",
    geltungsbereich: "Holzfenster & nichttragendes Au\xDFenholz"
  },
  {
    id: "bnb-pos46a",
    nr: "46a",
    standardCode: "BNB",
    kategorie: "10. Holzschutzmittel",
    bauteil: "Biozidhaltige und flammhemmende H\xF6lzer",
    anwendungsbereich: "Holzkonstruktionen und Bekleidungen im Innen- und Au\xDFenbereich",
    betrachteteStoffe: "Reproduktionstoxische Borverbindungen < 0,1 %",
    bezugsnorm: "REACH Anhang XIV / BNB Kriterium 1.1.6 Anlage 2",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): reproduktionstoxische Borverbindungen < 0,1 %",
    qs3: "QN 3 (50 Pkt): reproduktionstoxische Borverbindungen < 0,1 %",
    qs4: "QN 4 (75 Pkt): reproduktionstoxische Borverbindungen < 0,1 %",
    artDokumentation: "Herstellerauskunft nach REACH, Leistungserkl\xE4rung zur CE-Kennzeichnung",
    geltungsbereich: "Behandeltes Holz"
  },
  {
    id: "bnb-pos29",
    nr: "29",
    standardCode: "BNB",
    kategorie: "11. PVC-Produkte",
    bauteil: "Bauprodukte aus PVC",
    anwendungsbereich: "Wandbel\xE4ge, Lichtkuppeln, Fensterprofile, Rinnen, Rohre, Kan\xE4le, PVC-Folien",
    betrachteteStoffe: "Schwermetalle (Blei, Cadmium, Zinn) / Phthalate < 0,1 %",
    bezugsnorm: "REACH Anhang XVII / BNB Kriterium 1.1.6",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): keine Cadmium- und Bleistabilisatoren, Weich-PVC: Phthalat-Weichmacher < 0,1 %",
    qs3: "QN 3 (50 Pkt): keine Cadmium- und Bleistabilisatoren, Weich-PVC: Phthalat-Weichmacher < 0,1 %",
    qs4: "QN 4 (75 Pkt): keine Cadmium- und Bleistabilisatoren, Weich-PVC: Phthalat-Weichmacher < 0,1 %",
    artDokumentation: "PDB, TM, Herstellererkl\xE4rung, EPD",
    geltungsbereich: "PVC-Kunststoffbauteile"
  },
  {
    id: "bnb-pos32a",
    nr: "32a",
    standardCode: "BNB",
    kategorie: "12. D\xE4mmstoffe & Ortsch\xE4ume",
    bauteil: "Kunstschaum-D\xE4mmstoffe (EPS, XPS, PUR, PIR)",
    anwendungsbereich: "EPS/XPS/PUR/PIR/Melaminharzschaum f\xFCr Wand, Decke, Boden, TGA-D\xE4mmung",
    betrachteteStoffe: "Halogenierte Treibmittel / HBCDD / TCEP < 0,1 %",
    bezugsnorm: "BNB Kriterium 1.1.6 Anlage 2",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Frei von halogenierten Treibmitteln, HBCDD in EPS/XPS < 0,1 %, TCEP in PUR/PIR < 0,1 %",
    qs3: "QN 3 (50 Pkt): Frei von halogenierten Treibmitteln, HBCDD < 0,1 %, TCEP < 0,1 %",
    qs4: "QN 4 (75 Pkt): Frei von halogenierten Treibmitteln, HBCDD < 0,1 %, TCEP < 0,1 %",
    artDokumentation: "PDB, TM, EPD, Herstellererkl\xE4rung gem\xE4\xDF REACH",
    geltungsbereich: "Kunstschaum-D\xE4mmstoffe"
  },
  {
    id: "bnb-pos32b",
    nr: "32b",
    standardCode: "BNB",
    kategorie: "12. D\xE4mmstoffe & Ortsch\xE4ume",
    bauteil: "Gummiartige D\xE4mmprodukte (Kautschuk, PE, EPDM)",
    anwendungsbereich: "Bodend\xE4mmung, flexible TGA-D\xE4mmung im Innenbereich",
    betrachteteStoffe: "Altreifengranulat / Chlorparaffine / PBDE < 0,1 %",
    bezugsnorm: "BNB Kriterium 1.1.6 Anlage 2",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Frei von Altreifengranulat, Chlorparaffine/PBDE < 0,1 %",
    qs3: "QN 3 (50 Pkt): Frei von Altreifengranulat, Chlorparaffine/PBDE < 0,1 %",
    qs4: "QN 4 (75 Pkt): Frei von Altreifengranulat, Chlorparaffine/PBDE < 0,1 %",
    artDokumentation: "Herstellererkl\xE4rung",
    geltungsbereich: "Flexible Haustechnik-D\xE4mmstoffe"
  },
  {
    id: "bnb-pos33",
    nr: "33",
    standardCode: "BNB",
    kategorie: "12. D\xE4mmstoffe & Ortsch\xE4ume",
    bauteil: "Ortsch\xE4ume (Spritz- & Montagesch\xE4ume)",
    anwendungsbereich: "Montage von T\xFCren, Fenstern, Fassadend\xE4mmungen, Flachdach, Fugen",
    betrachteteStoffe: "Halogenierte Treibmittel / Formaldehyd / TCEP < 0,1 %",
    bezugsnorm: "BNB Kriterium 1.1.6 Pos. 33",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): Frei von halogenierten Treibmitteln, keine UF-Sch\xE4ume, PU-Sch\xE4ume: TCEP < 0,1 %",
    qs3: "QN 3 (50 Pkt): Frei von halogenierten Treibmitteln, keine UF-Sch\xE4ume, PU-Sch\xE4ume: TCEP < 0,1 %",
    qs4: "QN 4 (75 Pkt): Verzicht auf Spritz- und Montagesch\xE4ume (au\xDFer Fugen mit w\xE4rmetechnischer Anforderung gem. abZ)",
    artDokumentation: "PDB, TM, SDB, Herstellererkl\xE4rung",
    geltungsbereich: "Montagesch\xE4ume"
  },
  {
    id: "bnb-pos36a",
    nr: "36a",
    standardCode: "BNB",
    kategorie: "12. D\xE4mmstoffe & Ortsch\xE4ume",
    bauteil: "D\xE4mmstoffe f\xFCr Au\xDFenwandd\xE4mmungen (WDVS)",
    anwendungsbereich: "Mineralische und nicht mineralische Au\xDFenwandd\xE4mmungen (WDVS)",
    betrachteteStoffe: "Biozide / Halogenierte Treibmittel / RAL-UZ 140",
    bezugsnorm: "RAL-UZ 140 (Blauer Engel)",
    qs1: "QN 1 (10 Pkt): Deklaration biozider Wirkstoffe",
    qs2: "QN 2 (25 Pkt): f\xFCr Kunstschaum gilt Pos. 32a, f\xFCr organische D\xE4mmstoffe Pos. 46b",
    qs3: "QN 3 (50 Pkt): f\xFCr Kunstschaum Pos. 32a, organisch Pos. 46b",
    qs4: "QN 4 (75 Pkt): RAL-UZ 140 (Blauer Engel)",
    artDokumentation: "PDB, TM, SDB, Blauer Engel, EPD",
    geltungsbereich: "WDVS-D\xE4mmplatten"
  },
  {
    id: "bnb-pos36b",
    nr: "36b",
    standardCode: "BNB",
    kategorie: "12. D\xE4mmstoffe & Ortsch\xE4ume",
    bauteil: "Mineralische und nicht mineralische Innend\xE4mmungen",
    anwendungsbereich: "Innend\xE4mmung von Aufenthaltsr\xE4umen an Wand, Decke, Boden",
    betrachteteStoffe: "VOC / Biozide / AgBB / RAL-UZ 132",
    bezugsnorm: "AgBB-Schema / RAL-UZ 132",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): f\xFCr Kunstschaum Pos. 32a/b, organisch Pos. 46b",
    qs3: "QN 3 (50 Pkt): f\xFCr Kunstschaum Pos. 32a/b, organisch Pos. 46b",
    qs4: "QN 4 (75 Pkt): Kunstschaum 32a/b, organisch 46 + Einhaltung AgBB-Schema",
    artDokumentation: "PDB, TM, SDB, Blauer Engel DE-UZ 132, EPD",
    geltungsbereich: "Innend\xE4mmstoffe"
  },
  {
    id: "bnb-pos46b",
    nr: "46b",
    standardCode: "BNB",
    kategorie: "12. D\xE4mmstoffe & Ortsch\xE4ume",
    bauteil: "D\xE4mmstoffe aus nachwachsenden Rohstoffen",
    anwendungsbereich: "Zellulose, Holzfaserplatten, Holzwolle, Schafwolle in Wand/Decke/Dach",
    betrachteteStoffe: "Reproduktionstoxische Borverbindungen < 0,1 %",
    bezugsnorm: "BNB Kriterium 1.1.6 Anlage 2",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): reproduktionstoxische Borverbindungen < 0,1 %",
    qs3: "QN 3 (50 Pkt): reproduktionstoxische Borverbindungen < 0,1 %",
    qs4: "QN 4 (75 Pkt): reproduktionstoxische Borverbindungen < 0,1 %",
    artDokumentation: "Herstellerauskunft REACH, CE-Kennzeichnung",
    geltungsbereich: "Naturd\xE4mmstoffe"
  },
  {
    id: "bnb-pos34",
    nr: "34",
    standardCode: "BNB",
    kategorie: "13. K\xE4ltemittel",
    bauteil: "K\xE4ltemittel in RLT-Anlagen",
    anwendungsbereich: "RLT-Anlagen mit K\xE4ltetechnik",
    betrachteteStoffe: "Halogenierte K\xE4ltemittel",
    bezugsnorm: "BNB Kriterium 1.1.6 Pos. 34",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): keine Anforderungen",
    qs3: "QN 3 (50 Pkt): keine Anforderungen",
    qs4: "QN 4 (75 Pkt): Frei von voll- und teilhalogenierten K\xE4ltemitteln",
    artDokumentation: "PDB, TM, Herstellererkl\xE4rung K\xE4ltemittel, EPD",
    geltungsbereich: "RLT K\xE4ltemaschinen"
  },
  {
    id: "bnb-pos43",
    nr: "43",
    standardCode: "BNB",
    kategorie: "14. Betontrennmittel",
    bauteil: "Schal\xF6le und Trennmittel",
    anwendungsbereich: "Betonieren auf der Baustelle",
    betrachteteStoffe: "Gef\xE4hrliche Stoffe / GISCODE BTM / RAL-UZ 178",
    bezugsnorm: "GISCODE BTM10-BTM20 / RAL-UZ 178",
    qs1: "QN 1 (10 Pkt): Dokumentation",
    qs2: "QN 2 (25 Pkt): GISCODE BTM10/15/20",
    qs3: "QN 3 (50 Pkt): GISCODE BTM10/15",
    qs4: "QN 4 (75 Pkt): GISCODE BTM10",
    artDokumentation: "PDB, TM mit GISCODE, SDB, Blauer Engel",
    geltungsbereich: "Betontrennmittel"
  }
];
var INITIAL_SUSTAINABILITY_STANDARDS = [
  {
    id: "dgnb-env12-2023",
    code: "DGNB",
    name: "DGNB ENV1.2 (Neubau 2023)",
    institute: "Deutsche Gesellschaft f\xFCr Nachhaltiges Bauen e.V. (DGNB)",
    version: "2023",
    shortDescription: "Risiken f\xFCr die lokale Umwelt mit 4 Qualit\xE4tsstufen (QS 1\u2013QS 4) und strengem K.O.-Schwachstellenprinzip.",
    ratingSystemType: "QS1_QS4",
    criteriaRows: DEFAULT_DGNB_ENV12_MATRIX
  },
  {
    id: "qng-anhang3-2024",
    code: "QNG",
    name: "QNG Anhang 313 (Siegel 2023/2024)",
    institute: "Bundesministerium f\xFCr Wohnen, Stadtentwicklung und Bauwesen (BMWSB / BiRN)",
    version: "2023 v1.3",
    shortDescription: "Vermeidung von Schadstoffen in Baumaterialien (Anhangdokument 313, Version 1.3) f\xFCr das Qualit\xE4tssiegel Nachhaltiges Geb\xE4ude.",
    ratingSystemType: "QNG_PASS_FAIL",
    criteriaRows: DEFAULT_QNG_MATRIX
  },
  {
    id: "bnb-116-2023",
    code: "BNB",
    name: "BNB Neubau 1.1.6 (Bundesbau)",
    institute: "Bundesinstitut f\xFCr Bau-, Stadt- und Raumforschung (BBSR)",
    version: "2015/2023",
    shortDescription: "Bewertungssystem Nachhaltiges Bauen f\xFCr Bundesgeb\xE4ude \u2013 Risiken f\xFCr die lokale Umwelt (Anlage 1, Stufen QN 1\u20135, Sortierung nach 42 Bauproduktgruppen).",
    ratingSystemType: "BNB_STUFEN",
    criteriaRows: DEFAULT_BNB_MATRIX
  }
];

// src/utils/parameterRules.ts
var MONTHS = {
  januar: 0,
  jan: 0,
  january: 0,
  februar: 1,
  feb: 1,
  february: 1,
  m\u00E4rz: 2,
  maerz: 2,
  m\u00E4r: 2,
  mrz: 2,
  march: 2,
  april: 3,
  apr: 3,
  mai: 4,
  may: 4,
  juni: 5,
  jun: 5,
  june: 5,
  juli: 6,
  jul: 6,
  july: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  oktober: 9,
  okt: 9,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  dezember: 11,
  dez: 11,
  december: 11,
  dec: 11
};
function mkDate(y, m, d) {
  const date = new Date(Date.UTC(y, m, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m || date.getUTCDate() !== d) return null;
  return date;
}
function expandYear(y) {
  if (y >= 100) return y;
  return 2e3 + y;
}
function parseDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  let hadInvalidDay = false;
  let m = s.match(/\b(19\d\d|20\d\d)-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/);
  if (m) {
    const d = mkDate(+m[1], +m[2] - 1, +m[3]);
    if (d) return { date: d, precision: "day", raw: m[0] };
    hadInvalidDay = true;
  }
  m = s.match(/\b(0?[1-9]|[12]\d|3[01])[./](0?[1-9]|1[0-2])[./](19\d\d|20\d\d|\d\d)\b/);
  if (m) {
    const d = mkDate(expandYear(+m[3]), +m[2] - 1, +m[1]);
    if (d) return { date: d, precision: "day", raw: m[0] };
    hadInvalidDay = true;
  }
  const dm = s.matchAll(/\b(\d{1,2})\.?\s*([A-Za-zäöüÄÖÜ]{3,9})\.?\s*(19\d\d|20\d\d)\b/g);
  for (const x of dm) {
    const mon = MONTHS[x[2].toLowerCase()];
    if (mon !== void 0) {
      const d = mkDate(+x[3], mon, +x[1]);
      if (d) return { date: d, precision: "day", raw: x[0] };
      hadInvalidDay = true;
    }
  }
  if (hadInvalidDay) {
    return null;
  }
  const my = s.matchAll(/\b([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(19\d\d|20\d\d)\b/g);
  for (const x of my) {
    const mon = MONTHS[x[1].toLowerCase()];
    if (mon !== void 0) {
      const d = mkDate(+x[2], mon, 1);
      if (d) return { date: d, precision: "month", raw: x[0] };
    }
  }
  m = s.match(/\b(0?[1-9]|1[0-2])[./](19\d\d|20\d\d)\b/);
  if (m) {
    const d = mkDate(+m[2], +m[1] - 1, 1);
    if (d) return { date: d, precision: "month", raw: m[0] };
  }
  const cleaned = s.replace(/\b(19|20)\d\d\s*[-/_]\s*\d{2,}\b/g, " ").replace(/\b\d{2,}\s*[-/_]\s*(19|20)\d\d\b/g, " ").replace(/[:]\s*(19|20)\d\d\b/g, " ");
  const years = Array.from(cleaned.matchAll(/\b(19\d\d|20\d\d)\b/g)).map((x) => +x[1]);
  if (years.length > 0) {
    const d = mkDate(years[0], 0, 1);
    if (d) {
      return { date: d, precision: "year", raw: String(years[0]), ambiguous: new Set(years).size > 1 };
    }
  }
  return null;
}
function canonicalCertificates(input) {
  const text = Array.isArray(input) ? input.join(" \n ") : input || "";
  const found = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(/\bde[\s-]*uz[\s-]*(\d{1,3}[a-z]?)\b/gi)) {
    found.add(`DE-UZ ${m[1].toUpperCase()}`);
  }
  if (/blaue[rnm]?\s+engel/i.test(text)) found.add("BLAUER ENGEL");
  if (/\bec\s?1\s*(plus|\+)/i.test(text)) found.add("EC1 PLUS");
  if (/\bec\s?1(?!\d)(?!\s*(?:plus|\+))/i.test(text)) found.add("EC1");
  if (/\bagbb\b/i.test(text)) found.add("AGBB");
  if (/\bvdl[\s-]*rl[\s-]*0?1\b/i.test(text)) found.add("VDL-RL01");
  if (/\bnatureplus\b/i.test(text)) found.add("NATUREPLUS");
  if (/\beu[\s-]*ecolabel\b/i.test(text)) found.add("EU ECOLABEL");
  for (const m of text.matchAll(/\bgiscode\s+([a-z]{1,3}[\s-]?[a-z0-9]{1,4})\b/gi)) {
    found.add(`GISCODE ${m[1].toUpperCase().replace(/\s+/g, "")}`);
  }
  return Array.from(found).sort();
}
function matchCertRequirement(required, product) {
  let partial = false;
  for (const r of required) {
    if (r.startsWith("DE-UZ")) {
      if (product.includes(r)) return "met";
      if (product.includes("BLAUER ENGEL")) partial = true;
    } else if (r === "BLAUER ENGEL") {
      if (product.some((p) => p === "BLAUER ENGEL" || p.startsWith("DE-UZ"))) return "met";
    } else if (r === "EC1") {
      if (product.includes("EC1") || product.includes("EC1 PLUS")) return "met";
    } else if (product.includes(r)) {
      return "met";
    }
  }
  return partial ? "partial" : "none";
}
var VOC_NUM = /(<=|<|≤|≈|ca\.?|max\.?|maximal|bis\s+zu|unter)?\s*(\d+(?:[.,]\d+)?)\s*(g\s*\/\s*l|g\s+pro\s+liter|gramm\s+pro\s+liter)(?![a-zäöü])/gi;
var LIMIT_CONTEXT = /(grenzwert|grenzwerte|limit|höchstgehalt|kat(?:egorie|\.)?\s*[a-z]\b|decopaint|2004\/42|anhang\s+ii|gefordert|anforderung|zulässig|vorgabe)/i;
function toOp(prefix) {
  const p = (prefix || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (p === "<" || p === "unter") return "<";
  if (p === "<=" || p === "\u2264" || p.startsWith("max") || p === "bis zu") return "<=";
  return "=";
}
function parseVoc(textInput) {
  const text = (textInput || "").replace(/(\d)\s*,\s*(\d)/g, "$1.$2");
  const candidates = [];
  const limitCandidates = [];
  let prevEnd = 0;
  for (const m of text.matchAll(VOC_NUM)) {
    const start = m.index ?? 0;
    const ctxStart = Math.max(prevEnd, start - 100);
    const context = text.slice(ctxStart, start);
    const after = text.slice(start + m[0].length, start + m[0].length + 40);
    const value = parseFloat(m[2]);
    prevEnd = start + m[0].length;
    if (!isFinite(value)) continue;
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const linePrefix = text.slice(lineStart, start);
    let score = 0;
    if (/voc|flüchtig|lösemittel|lösungsmittel/i.test(context)) score += 2;
    if (/voc/i.test(after)) score += 1;
    if (/enth[aä]lt|gehalt|beträgt|ermittelt|gemessen/i.test(context)) score += 1;
    if (/^\s*(voc|tvoc)/i.test(linePrefix)) score += 3;
    const cand = { value, op: toOp(m[1]), raw: m[0].trim(), score };
    if (LIMIT_CONTEXT.test(context)) {
      limitCandidates.push(cand);
    } else {
      candidates.push(cand);
    }
  }
  const lower = text.toLowerCase();
  const solventFree = /(?<!nicht\s)(?<!un)(?<!kein\s)(?:lösemittel|lösungsmittel)frei/.test(lower) || /(?<!nicht\s)voc[\s-]?frei/.test(lower) || /(?<!nicht\s)frei\s+von\s+(?:lösemittel|lösungsmittel)/.test(lower);
  let found = false;
  let best;
  let ambiguous = false;
  if (candidates.length > 0) {
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    best = sorted[0];
    found = true;
    const top = sorted.filter((c) => c.score === best.score);
    ambiguous = top.some((c) => c.value !== best.value || c.op !== best.op);
  }
  const unitMismatch = !found && /voc[^.\n]{0,60}\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%[^.\n]{0,40}(?:voc|lösemittel|lösungsmittel)/i.test(text);
  return {
    found,
    value: best?.value,
    op: best?.op,
    raw: best?.raw,
    solventFree,
    ambiguous,
    candidates,
    onlyLimitValues: !found && limitCandidates.length > 0,
    unitMismatch
  };
}
function formatVoc(f) {
  if (f.found && f.value !== void 0) {
    const sym = f.op === "<" ? "< " : f.op === "<=" ? "\u2264 " : "";
    const v = `${sym}${String(f.value).replace(".", ",")} g/l`;
    return f.solventFree ? `${v} (l\xF6semittelfrei)` : v;
  }
  if (f.solventFree) return "l\xF6semittelfrei";
  return "Kein Nachweis im Dokument";
}
var REQ_NUM = /(<=|<|≤|max\.?|bis)?\s*(\d+(?:[.,]\d+)?)\s*g\s*\/\s*l(?![a-zäöü])/i;
function reqNumeric(text) {
  const m = text.match(REQ_NUM);
  if (!m) return void 0;
  const value = parseFloat(m[2].replace(",", "."));
  if (!isFinite(value)) return void 0;
  return { op: m[1] === "<" ? "<" : "<=", value };
}
function parseRequirement(textInput) {
  const raw = textInput || "";
  const condMatch = raw.match(/\(([^)]*(?:alternativ|werkseitig)[^)]*)\)/i);
  const main = condMatch ? raw.replace(condMatch[0], " ") : raw;
  const numeric = reqNumeric(main);
  const conditionalNumeric = condMatch ? reqNumeric(condMatch[1]) : void 0;
  const needsSolventFree = /(lösemittel|lösungsmittel)frei/i.test(main);
  const hasUncheckableExtras = /weichmacherfrei|konservierungs(?:mittel)?frei|biozid/i.test(main);
  const certs = canonicalCertificates(main);
  const otherUnits = /µg\s*\/\s*m³|mg\s*\/\s*m³|mg\s*\/\s*kg|\bppm\b|%/i.test(main);
  return {
    raw,
    numeric,
    conditionalNumeric,
    needsSolventFree,
    hasUncheckableExtras,
    certs,
    otherUnits,
    parsable: Boolean(numeric || needsSolventFree || certs.length > 0)
  };
}
function numericMet(voc, req) {
  const u = voc.value;
  const strict = req.op === "<";
  if (voc.op === "<") return u <= req.value;
  return strict ? u < req.value : u <= req.value;
}
function checkOneLevel(level, reqText, voc, productCerts) {
  const req = parseRequirement(reqText);
  const base = { level, requirement: reqText };
  if (!req.parsable) {
    return { ...base, status: "unknown", reason: `Anforderung f\xFCr QS ${level} nicht automatisch auswertbar (\u201E${reqText.slice(0, 80)}\u201C).` };
  }
  if (req.otherUnits && !req.numeric && req.certs.length === 0 && !req.needsSolventFree) {
    return { ...base, status: "unknown", reason: `Anforderung f\xFCr QS ${level} betrifft eine andere Messgr\xF6\xDFe als VOC in g/l.` };
  }
  let metBy = null;
  let partialCert = false;
  if (req.numeric && voc.found && voc.value !== void 0 && numericMet(voc, req.numeric)) metBy = "numeric";
  if (!metBy && req.certs.length > 0) {
    const cm = matchCertRequirement(req.certs, productCerts);
    if (cm === "met") metBy = "cert";
    else if (cm === "partial") partialCert = true;
  }
  if (!metBy && req.needsSolventFree && voc.solventFree) metBy = "solventFree";
  if (metBy === "solventFree" && req.hasUncheckableExtras && req.certs.length > 0) {
    return {
      ...base,
      status: "unknown",
      reason: `QS ${level}: \u201El\xF6semittelfrei\u201C belegt, Zusatzanforderungen (weichmacher-/konservierungsmittelfrei) bzw. Zeichen ${req.certs.join(" / ")} nicht belegt.`
    };
  }
  if (metBy) {
    const via = metBy === "numeric" ? `Wert ${formatVoc(voc)}` : metBy === "cert" ? "Zertifikat" : "l\xF6semittelfrei";
    return { ...base, status: "met", reason: `QS ${level} erf\xFCllt (${via}).` };
  }
  if (partialCert) {
    return { ...base, status: "unknown", reason: `QS ${level}: Umweltzeichen genannt, aber ohne eindeutige Nummer (${req.certs.join(" / ")} gefordert).` };
  }
  if (req.conditionalNumeric && voc.found && voc.value !== void 0 && numericMet(voc, req.conditionalNumeric)) {
    return { ...base, status: "unknown", reason: `QS ${level}: Alternativwert gilt nur unter Bedingung (z. B. werkseitige Beschichtung) \u2013 bitte pr\xFCfen.` };
  }
  if (!voc.found && !voc.solventFree && productCerts.length === 0) {
    return { ...base, status: "not-met", reason: `QS ${level} nicht belegt: kein VOC-Wert und kein Zeichen im Dokument.` };
  }
  return { ...base, status: "not-met", reason: `QS ${level} nicht erf\xFCllt (Anforderung: ${reqText.slice(0, 80)}).` };
}
function evaluateRowLevels(row, voc, productCerts) {
  if (!row) {
    return {
      achievedLevel: 1,
      checks: [],
      needsManualReview: true,
      reviewReason: "Dem gew\xE4hlten Standard ist keine Kriterienzeile zugeordnet \u2013 bitte manuell pr\xFCfen."
    };
  }
  const levels = [
    [4, row.qs4],
    [3, row.qs3],
    [2, row.qs2],
    [1, row.qs1]
  ];
  const checks = levels.map(([l, t]) => checkOneLevel(l, t || "", voc, productCerts));
  const met = checks.find((c) => c.status === "met");
  const achievedLevel = met ? met.level : 1;
  const unknownAbove = checks.find((c) => c.status === "unknown" && c.level > achievedLevel);
  let needsManualReview = Boolean(unknownAbove);
  let reviewReason = unknownAbove?.reason;
  if (voc.ambiguous) {
    needsManualReview = true;
    reviewReason = "Mehrere unterschiedliche VOC-Werte im Dokument \u2013 bitte den ma\xDFgeblichen Wert pr\xFCfen.";
  }
  return { achievedLevel, checks, needsManualReview, reviewReason };
}
function evaluateLabelLevels(row, productCerts) {
  if (!row) {
    return {
      achievedLevel: 1,
      checks: [],
      needsManualReview: true,
      reviewReason: "Dem gew\xE4hlten Standard ist keine Kriterienzeile zugeordnet \u2013 bitte manuell pr\xFCfen."
    };
  }
  const levels = [
    [4, row.qs4],
    [3, row.qs3],
    [2, row.qs2],
    [1, row.qs1]
  ];
  const checks = levels.map(([l, t]) => {
    const req = parseRequirement(t || "");
    if (req.certs.length === 0) {
      return { level: l, status: "met", reason: `QS ${l}: kein Zeichen gefordert.`, requirement: t || "" };
    }
    const cm = matchCertRequirement(req.certs, productCerts);
    if (cm === "met") return { level: l, status: "met", reason: `QS ${l}: Zeichen nachgewiesen.`, requirement: t || "" };
    if (cm === "partial") {
      return { level: l, status: "unknown", reason: `QS ${l}: Zeichen ohne eindeutige Nummer genannt (${req.certs.join(" / ")} gefordert).`, requirement: t || "" };
    }
    return { level: l, status: "not-met", reason: `QS ${l}: gefordertes Zeichen (${req.certs.join(" / ")}) nicht nachgewiesen.`, requirement: t || "" };
  });
  const met = checks.find((c) => c.status === "met");
  const achievedLevel = met ? met.level : 1;
  const unknownAbove = checks.find((c) => c.status === "unknown" && c.level > achievedLevel);
  return {
    achievedLevel,
    checks,
    needsManualReview: Boolean(unknownAbove),
    reviewReason: unknownAbove?.reason
  };
}
var SVHC_TERMS = /svhc|besonders\s+besorgniserregend|kandidatenliste|candidate\s+list|very\s+high\s+concern/i;
var SVHC_NEG = /\b(keine|kein|keinen|keiner|keines|nicht|ohne|frei\s+von)\b|(?:<=|<|≤|unter|bis)\s*0\.1\b|0\.1\s*%?\s*(?:w\/w)?\s*(?:oder\s+weniger|nicht\s+überschritten)/i;
var SVHC_POS = />\s*0\.1|≥\s*0\.1|mehr\s+als\s+0\.1|über\s+0\.1|oberhalb|enth[aä]lt|enthalten|beinhaltet|vorhanden|gelistet/i;
function evaluateSvhc(textInput) {
  const text = (textInput || "").replace(/(\d)\s*,\s*(\d)/g, "$1.$2").replace(/(\d)\.(\d)/g, "$1\xA7$2");
  const clauses = text.split(/[.;\n]+/).map((c) => c.replace(/§/g, ".").trim()).filter(Boolean);
  const none = [];
  const present = [];
  const unclear = [];
  for (const c of clauses) {
    if (!SVHC_TERMS.test(c)) continue;
    if (SVHC_NEG.test(c)) none.push(c);
    else if (SVHC_POS.test(c)) present.push(c);
    else unclear.push(c);
  }
  if (present.length > 0) return { status: "present", evidence: present[0] };
  if (none.length > 0) return { status: "none", evidence: none[0] };
  if (unclear.length > 0) return { status: "unclear", evidence: unclear[0] };
  return { status: "missing" };
}

// src/utils/dgnbEvaluation.ts
function evaluateTestDateAge(dateStr, referenceDate = /* @__PURE__ */ new Date()) {
  if (!dateStr || !dateStr.trim() || /\b(kein|keine|fehlt|unbekannt|nicht angegeben)\b/i.test(dateStr)) {
    return {
      ageYears: null,
      achievedLevel: 2,
      status: "warning",
      explanation: "Kein Pr\xFCfberichtsdatum f\xFCr die VOC-Emissionsmessung angegeben. Gem\xE4\xDF Institutsvorgaben (DGNB/AgBB) d\xFCrfen Pr\xFCfberichte maximal 5 Jahre alt sein (bzw. max. 10 Jahre mit Rezepturbest\xE4tigung).",
      needsManualReview: true
    };
  }
  const parsed = parseDate(dateStr);
  if (!parsed) {
    return {
      ageYears: null,
      achievedLevel: 2,
      status: "warning",
      explanation: `Das \xFCbergebene Pr\xFCfdatum "${dateStr}" konnte keinem g\xFCltigen Datum zugeordnet werden (Berichtsnummern und Normjahre werden ignoriert). DGNB/AgBB fordern einen g\xFCltigen Nachweis \u2264 5 Jahre.`,
      needsManualReview: true
    };
  }
  const refDate = typeof referenceDate === "number" ? new Date(Date.UTC(referenceDate, 11, 31)) : referenceDate;
  const refYear = typeof referenceDate === "number" ? referenceDate : referenceDate.getUTCFullYear();
  const testYear = parsed.date.getUTCFullYear();
  if (testYear > refYear || typeof referenceDate !== "number" && parsed.precision !== "year" && parsed.date.getTime() > refDate.getTime() + 864e5) {
    return {
      ageYears: null,
      achievedLevel: 1,
      status: "fail",
      explanation: `Ung\xFCltiges Pr\xFCfdatum "${dateStr}": Das Datum liegt in der Zukunft und kann nicht als g\xFCltiger Nachweis gewertet werden.`,
      needsManualReview: true
    };
  }
  let ageYears;
  if (typeof referenceDate === "number" || parsed.precision === "year") {
    ageYears = Math.max(0, refYear - testYear);
  } else {
    const diffMs = refDate.getTime() - parsed.date.getTime();
    ageYears = Math.max(0, Math.round(diffMs / (365.25 * 24 * 3600 * 1e3) * 10) / 10);
  }
  const ambiguityHint = parsed.ambiguous ? " Hinweis: Im Text wurden mehrere Jahreszahlen gefunden \u2013 bitte Pr\xFCfdatum manuell verifizieren." : "";
  if (ageYears <= 5) {
    return {
      ageYears,
      achievedLevel: 4,
      status: parsed.ambiguous ? "warning" : "pass",
      explanation: `G\xFCltiger Pr\xFCfbericht: Datum "${parsed.raw}" (Alter ca. ${ageYears} Jahr(e)). Erf\xFCllt die DGNB/AgBB/EMICODE 5-Jahres-Frist ohne Einschr\xE4nkung.${ambiguityHint}`,
      needsManualReview: Boolean(parsed.ambiguous)
    };
  } else if (ageYears <= 10) {
    return {
      ageYears,
      achievedLevel: 2,
      status: "warning",
      explanation: `Warnung (Pr\xFCfbericht > 5 Jahre): Datum "${parsed.raw}" (Alter ca. ${ageYears} Jahre). Laut DGNB/AgBB ist eine schriftliche Herstellererkl\xE4rung zur unver\xE4nderten Rezeptur erforderlich.${ambiguityHint}`,
      needsManualReview: true
    };
  } else {
    return {
      ageYears,
      achievedLevel: 1,
      status: "fail",
      explanation: `K.O.-Kriterium (Pr\xFCfbericht abgelaufen): Datum "${parsed.raw}" (Alter ca. ${ageYears} Jahre). Pr\xFCfberichte \xE4lter als 10 Jahre werden von den Instituten als veraltet und ung\xFCltig eingestuft.${ambiguityHint}`,
      needsManualReview: Boolean(parsed.ambiguous)
    };
  }
}
function evaluateDgnbCompliance(parameters, hasBauteilekatalog) {
  if (!parameters || parameters.length === 0) {
    return {
      overallLevel: 1,
      maxChemicalLevel: 1,
      isBauteilekatalogKO: false,
      bottleneckParameter: null,
      bottleneckReason: "Keine messbaren Pr\xFCfparameter \xFCbergeben.",
      userExplanation: "Es konnten keine stofflichen Kennwerte aus den Dokumenten ermittelt werden.",
      evaluatedParameters: [],
      isProvisional: true
    };
  }
  let lowestParamLevel = 4;
  for (const p of parameters) {
    if (p.achievedLevel < lowestParamLevel) {
      lowestParamLevel = p.achievedLevel;
    }
  }
  const evaluatedParameters = parameters.map((p) => {
    const isBottleneck = p.achievedLevel === lowestParamLevel && lowestParamLevel < 4;
    let status;
    if (p.achievedLevel >= 3) {
      status = p.needsManualReview ? "warning" : "pass";
    } else if (p.achievedLevel === 2) {
      status = "warning";
    } else {
      status = "fail";
    }
    return {
      ...p,
      isBottleneck,
      status
    };
  });
  const isProvisional = evaluatedParameters.some(
    (p) => p.needsManualReview || p.evidence?.verification === "unverified"
  );
  const bottleneckParam = evaluatedParameters.find((p) => p.achievedLevel === lowestParamLevel) || null;
  const maxChemicalLevel = lowestParamLevel;
  let overallLevel = lowestParamLevel;
  let isBauteilekatalogKO = false;
  let bauteilekatalogImpactNote = "";
  if (lowestParamLevel >= 3 && !hasBauteilekatalog) {
    overallLevel = 2;
    isBauteilekatalogKO = true;
    bauteilekatalogImpactNote = "Herabstufung auf Qualit\xE4tsstufe 2: Stofflich erf\xFCllt das Produkt zwar Stufe " + lowestParamLevel + ", jedoch fehlt der gem\xE4\xDF DGNB ENV1.2 f\xFCr Stufe 3 und 4 zwingend erforderliche material\xF6kologische Bauteilekatalog nebst Baustellenkontroll-Nachweis.";
  } else if (lowestParamLevel >= 3 && hasBauteilekatalog) {
    bauteilekatalogImpactNote = "Annahme f\xFCr QS 3/4: Material\xF6kologischer Bauteilekatalog bzw. QNG-ready-Nachweisf\xFChrung wird vorausgesetzt (Standardeinstellung aktiv).";
  }
  let bottleneckReason = "";
  let userExplanation = "";
  if (overallLevel === 4) {
    bottleneckReason = isProvisional ? "Vorl\xE4ufig QS 4 \u2013 mindestens ein Parameter erfordert noch eine manuelle Pr\xFCfung." : "Kein Engpass \u2013 Alle Anforderungen f\xFCr QS 4 l\xFCckenlos erf\xFCllt.";
    userExplanation = isProvisional ? "Vorl\xE4ufiges Ergebnis: Rechnerisch werden die Anforderungen f\xFCr Qualit\xE4tsstufe 4 erreicht, jedoch sind einzelne Belege oder Zusatzanforderungen als \u201Ebitte manuell pr\xFCfen\u201C markiert." : "Exzellentes Ergebnis: Das Produkt erf\xFCllt in allen gepr\xFCften Parametern (VOC, SVHC, Umweltzeichen/Emissionspr\xFCfung) sowie in der Nachweisf\xFChrung die strengste DGNB-Qualit\xE4tsstufe 4. Es darf ohne Einschr\xE4nkungen f\xFCr H\xF6chstbewertungen eingesetzt werden.";
  } else if (isBauteilekatalogKO) {
    bottleneckReason = "Fehlender material\xF6kologischer Bauteilekatalog (K.O.-Kriterium f\xFCr QS 3 und QS 4)";
    userExplanation = "Die chemischen und emissionsbezogenen Grenzwerte erf\xFCllen isoliert die Qualit\xE4tsstufe " + maxChemicalLevel + ". Gem\xE4\xDF offiziellem DGNB-Regelwerk d\xFCrfen die Qualit\xE4tsstufen 3 und 4 jedoch ausschlie\xDFlich dann vergeben werden, wenn ein vollst\xE4ndiger material\xF6kologischer Bauteilekatalog vorliegt. Da dieser Nachweis fehlt, greift die automatische Herabstufung auf Qualit\xE4tsstufe 2.";
  } else {
    const paramName = bottleneckParam?.parameterName || "Ein stofflicher Parameter";
    const paramVal = bottleneckParam?.productValue || "Gemessener Wert";
    bottleneckReason = `Schwachstelle: "${paramName}" erreicht nur QS ${lowestParamLevel} (${paramVal}).`;
    userExplanation = `Das DGNB-Schwachstellenprinzip (K.O.-Verfahren) besagt: Ein Produkt ist immer nur so gut wie sein schw\xE4chster Einzelwert. Hier verhindert der Parameter "${paramName}" mit dem Wert "${paramVal}" eine Einstufung in eine h\xF6here Qualit\xE4tsstufe. Sobald f\xFCr diesen Parameter ein Nachweis f\xFCr die n\xE4chsth\xF6here Stufe erbracht wird, steigt die Gesamtnote.`;
  }
  return {
    overallLevel,
    maxChemicalLevel,
    isBauteilekatalogKO,
    bottleneckParameter: isBauteilekatalogKO ? null : bottleneckParam,
    bottleneckReason,
    userExplanation,
    bauteilekatalogImpactNote,
    evaluatedParameters,
    isProvisional
  };
}

// src/utils/pdfText.ts
import { extractText, getDocumentProxy } from "unpdf";
var PDF_MAGIC_BYTES = Buffer.from([37, 80, 68, 70, 45]);
function hasPdfMagicBytes(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return buffer[0] === 37 && // %
  buffer[1] === 80 && // P
  buffer[2] === 68 && // D
  buffer[3] === 70 && // F
  buffer[4] === 45;
}
function toPdfBytes(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const clean = input.replace(/^data:application\/pdf;base64,/i, "").trim();
    if (!clean) return null;
    try {
      const buf = Buffer.from(clean, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return null;
}
async function extractPdfPages(input) {
  try {
    const bytes = toPdfBytes(input);
    if (!bytes || bytes.length < 5 || !hasPdfMagicBytes(bytes)) {
      return { pages: [], hasTextLayer: false };
    }
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text)];
    const totalChars = pages.join("").replace(/\s/g, "").length;
    return { pages, hasTextLayer: totalChars >= 50 };
  } catch (err) {
    console.warn("PDF-Textextraktion fehlgeschlagen:", err?.message || err);
    return { pages: [], hasTextLayer: false };
  }
}
var EXCERPT_KEYWORDS = /(voc\b|flüchtige organische|lösemittel|lösungsmittel|g\/l|svhc|kandidatenliste|besonders besorgniserregend|prüfdatum|prüfbericht|datum der prüfung|ausgestellt|emicode|ec1|blauer engel|de-uz|agbb|giscode|natureplus)/i;
function buildExcerpts(pages, maxExcerpts = 8, maxLen = 400) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (let p = 0; p < pages.length && out.length < maxExcerpts; p++) {
    const flat = pages[p].replace(/\s+/g, " ");
    const sentences = flat.split(/(?<=[.;:])\s+/);
    for (const s of sentences) {
      if (out.length >= maxExcerpts) break;
      if (s.length < 15 || !EXCERPT_KEYWORDS.test(s)) continue;
      const text = s.length > maxLen ? s.slice(0, maxLen) + " \u2026" : s;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ page: p + 1, text });
    }
  }
  return out;
}

// src/utils/quoteVerification.ts
function normalizeForMatch(input) {
  return (input || "").normalize("NFKC").toLowerCase().replace(/\u00ad/g, "").replace(/[-\u2010-\u2015\u2212]\s*\r?\n\s*/g, "").replace(/[-\u2010-\u2015\u2212]/g, "").replace(/[\u2018\u2019\u201a\u201b\u201c\u201d\u201e"'`´]/g, "").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/(\d),(\d)/g, "$1.$2").replace(/(?<!\d)\.|\.(?!\d)/g, " ").replace(/[^\p{L}\p{N}<>=.%/ ]/gu, " ").replace(/\s+/g, " ").trim();
}
function numberTokens(s) {
  const m = normalizeForMatch(s).match(/\d+(?:\.\d+)?/g) || [];
  return m.map((d) => String(parseFloat(d)));
}
function valueSupportedByQuote(value, quote) {
  const v = normalizeForMatch(value);
  const q = normalizeForMatch(quote);
  if (!v) return false;
  if (!q) return false;
  const quoteLower = (quote || "").toLowerCase();
  const hasNegationInQuote = /\b(nicht|fehlt|ohne|kein|keine|keinen|keiner|keines|niemals)\b/i.test(quoteLower);
  const valueHasNegationOrFree = /\b(kein|keine|ohne|nicht|lösemittelfrei|schadstofffrei|emissionsfrei|svhc-frei)\b/i.test(v);
  if (hasNegationInQuote && !valueHasNegationOrFree) {
    return false;
  }
  if (q.includes(v)) return true;
  const vNums = numberTokens(value);
  if (vNums.length > 0) {
    const qNums = new Set(numberTokens(quote));
    return vNums.every((n) => qNums.has(n));
  }
  const words = v.split(" ").filter((w) => w.length >= 4);
  if (words.length === 0) return q.includes(v);
  const hits = words.filter((w) => q.includes(w)).length;
  return hits / words.length >= 0.5;
}
function bestFuzzyWindow(quoteTokens, pageTokens) {
  const L = quoteTokens.length;
  if (L === 0 || pageTokens.length === 0) return 0;
  const set = new Set(quoteTokens);
  const member = pageTokens.map((t) => set.has(t) ? 1 : 0);
  const win = Math.min(L, pageTokens.length);
  let sum = 0;
  for (let i = 0; i < win; i++) sum += member[i];
  let best = sum;
  for (let i = win; i < member.length; i++) {
    sum += member[i] - member[i - win];
    if (sum > best) best = sum;
  }
  return best / L;
}
function verifyQuote(quote, value, pages) {
  const normPages = (pages || []).map(normalizeForMatch);
  if (normPages.length === 0 || normPages.every((p) => p.length === 0)) {
    return { verification: "no-text-layer", reason: "PDF enth\xE4lt keinen auslesbaren Text." };
  }
  const nq = normalizeForMatch(quote || "");
  if (nq.length < 3) {
    return { verification: "unverified", reason: "Kein Zitat geliefert." };
  }
  const hasNumbersInValue = value ? numberTokens(value).length > 0 : false;
  for (let i = 0; i < normPages.length; i++) {
    if (normPages[i].includes(nq)) {
      if (value && !valueSupportedByQuote(value, quote || "")) {
        if (hasNumbersInValue) {
          return {
            verification: "unverified",
            page: i + 1,
            reason: "Zahlenwert im Feld stimmt nicht mit dem gefundenen PDF-Zitat \xFCberein."
          };
        }
        return {
          verification: "partial",
          page: i + 1,
          reason: "Zitat gefunden, st\xFCtzt den Wert aber nicht vollst\xE4ndig."
        };
      }
      return { verification: "verified", page: i + 1 };
    }
  }
  const qTokens = nq.split(" ").filter(Boolean);
  if (qTokens.length >= 3) {
    let bestRatio = 0;
    let bestPage = -1;
    for (let i = 0; i < normPages.length; i++) {
      const ratio = bestFuzzyWindow(qTokens, normPages[i].split(" ").filter(Boolean));
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestPage = i;
      }
    }
    if (bestRatio >= 0.85 && bestPage >= 0) {
      const supported = !value || valueSupportedByQuote(value, quote || "");
      if (!supported && hasNumbersInValue) {
        return {
          verification: "unverified",
          page: bestPage + 1,
          reason: "Zahlenwert im Feld stimmt nicht mit dem PDF-Zitat \xFCberein."
        };
      }
      return {
        verification: "partial",
        page: bestPage + 1,
        reason: supported ? "Zitat nur sinngem\xE4\xDF im PDF gefunden." : "Zitat nur sinngem\xE4\xDF gefunden, st\xFCtzt den Wert nicht vollst\xE4ndig."
      };
    }
  }
  return { verification: "unverified", reason: "Zitat nicht im PDF-Text gefunden." };
}

// server.ts
dotenv.config();
var app = express();
var rawPort = process.env.PORT || "3000";
var isPipe = rawPort.startsWith("\\\\.\\pipe\\") || rawPort.startsWith("/");
var PORT = isPipe ? rawPort : parseInt(rawPort, 10) || 3e3;
var defaultAppletConfig = {};
try {
  const cfgPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    defaultAppletConfig = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  }
} catch {
}
var FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || defaultAppletConfig.projectId || "gen-lang-client-0723441171";
var rawEnvDbId = (process.env.FIREBASE_FIRESTORE_DATABASE_ID || "").replace(/^['"]+|['"]+$/g, "").trim();
var fallbackDbId = defaultAppletConfig.firestoreDatabaseId || "ai-studio-dgnbenv12qmprfto-9665ebc6-a4b9-418d-9d5d-967112a73de4";
var FIRESTORE_DATABASE_ID = !rawEnvDbId ? fallbackDbId : !rawEnvDbId.startsWith("ai-studio-") && fallbackDbId.endsWith(rawEnvDbId) ? fallbackDbId : rawEnvDbId.startsWith("dgnbenv12qmprfto-") ? `ai-studio-${rawEnvDbId}` : rawEnvDbId;
var GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV?.toLowerCase() === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
app.use((req, _res, next) => {
  if (!req.url.startsWith("/api") && (req.url.startsWith("/auth/") || req.url.startsWith("/standards/") || req.url.startsWith("/documents/") || req.url.startsWith("/dgnb/"))) {
    req.url = "/api" + req.url;
  }
  next();
});
function createRateLimiter(options) {
  const store = /* @__PURE__ */ new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of store.entries()) {
      if (now > bucket.resetAt) store.delete(ip);
    }
  }, 60 * 1e3);
  cleanup.unref();
  return (req, res, next) => {
    const rawIp = req.ip || req.socket.remoteAddress || "unknown-client";
    const now = Date.now();
    let bucket = store.get(rawIp);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + options.windowMs };
      store.set(rawIp, bucket);
    } else {
      bucket.count++;
    }
    const remaining = Math.max(0, options.max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1e3);
    res.setHeader("X-RateLimit-Limit", options.max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);
    if (bucket.count > options.max) {
      res.setHeader("Retry-After", resetSeconds);
      return res.status(429).json({
        success: false,
        code: "RATE_LIMIT_EXCEEDED",
        message: options.message
      });
    }
    next();
  };
}
var authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1e3,
  max: 60,
  message: "Zu viele Authentifizierungsanfragen. Bitte warten Sie einige Minuten."
});
var aiRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1e3,
  max: 30,
  message: "Zu viele KI-Verarbeitungsanfragen. Bitte warten Sie einige Minuten."
});
var analysisRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1e3,
  max: 60,
  message: "Zu viele Analyseanfragen. Bitte warten Sie einige Minuten."
});
app.use("/api/auth/", authRateLimiter);
app.use("/api/documents/parse-pdf", aiRateLimiter);
app.use("/api/standards/parse-guideline-pdf", aiRateLimiter);
app.use("/api/standards/analyze-product", analysisRateLimiter);
function sanitizeErrorMessage(fallbackProdMsg, err) {
  if (process.env.NODE_ENV?.toLowerCase() === "production") {
    return fallbackProdMsg;
  }
  return `${fallbackProdMsg}: ${err?.message || String(err)}`;
}
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function parseEmailList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_REGEX.test(e));
}
var DEFAULT_ADMIN_EMAILS = ["brian.lackmann@kaubit.de", "brianlackmann@gmail.com"];
var DEFAULT_ALLOWED_EMAILS = [
  "brian.lackmann@kaubit.de",
  "brianlackmann@gmail.com",
  "admin@dgnb-qm.de",
  "auditor@bau-qm.org"
];
function getAdminEmails() {
  const fromEnv = parseEmailList(process.env.ADMIN_EMAILS);
  const list = fromEnv.length > 0 ? fromEnv : DEFAULT_ADMIN_EMAILS;
  return new Set(list.map((e) => e.toLowerCase()));
}
function getConfiguredAllowedEmails() {
  const fromEnv = parseEmailList(process.env.ALLOWED_EMAILS);
  const list = fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_EMAILS;
  return new Set(list.map((e) => e.toLowerCase()));
}
function isAdminEmail(email) {
  if (!email) return false;
  return getAdminEmails().has(email.trim().toLowerCase());
}
var VAULT_DISK_PATH = path.resolve(process.cwd(), ".data", "company-vault.json");
function loadVaultFromDisk() {
  if (process.env.NODE_ENV?.toLowerCase() === "test") return null;
  try {
    if (fs.existsSync(VAULT_DISK_PATH)) {
      const raw = fs.readFileSync(VAULT_DISK_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          saltHex: typeof parsed.saltHex === "string" ? parsed.saltHex : "",
          verifierHex: typeof parsed.verifierHex === "string" ? parsed.verifierHex : "",
          updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
          updatedByEmail: typeof parsed.updatedByEmail === "string" ? parsed.updatedByEmail : "",
          authorizedEmails: Array.isArray(parsed.authorizedEmails) ? parsed.authorizedEmails : Array.from(getAdminEmails())
        };
      }
    }
  } catch {
  }
  return null;
}
function saveVaultToDisk(state) {
  if (process.env.NODE_ENV?.toLowerCase() === "test") return;
  try {
    const dir = path.dirname(VAULT_DISK_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(VAULT_DISK_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch {
  }
}
var companyVaultState = loadVaultFromDisk();
function getEffectiveAuthorizedEmails() {
  const admins = Array.from(getAdminEmails());
  const configured = Array.from(getConfiguredAllowedEmails());
  const fromVault = companyVaultState?.authorizedEmails?.map((e) => e.trim().toLowerCase()).filter(Boolean) || [];
  return Array.from(/* @__PURE__ */ new Set([...admins, ...configured, ...fromVault]));
}
function isAuthorizedEmail(email) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (isAdminEmail(normalized)) return true;
  return getEffectiveAuthorizedEmails().includes(normalized);
}
var FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;
async function fetchVaultFromFirestoreRest(idToken) {
  if (!idToken || process.env.NODE_ENV?.toLowerCase() === "test" || idToken.startsWith("test-jwt:")) return null;
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/vault/company`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });
    if (!res.ok) return null;
    const docJson = await res.json();
    const fields = docJson?.fields;
    if (!fields) return null;
    const saltHex = fields.saltHex?.stringValue || "";
    const verifierHex = fields.verifierHex?.stringValue || "";
    const updatedAt = fields.updatedAt?.stringValue || (/* @__PURE__ */ new Date()).toISOString();
    const updatedByEmail = fields.updatedByEmail?.stringValue || "";
    const rawEmails = fields.authorizedEmails?.arrayValue?.values?.map((v) => v?.stringValue).filter(Boolean) || [];
    const mergedEmails = Array.from(
      /* @__PURE__ */ new Set([
        ...Array.from(getAdminEmails()),
        ...rawEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
      ])
    );
    const loaded = {
      saltHex,
      verifierHex,
      updatedAt,
      updatedByEmail,
      authorizedEmails: mergedEmails
    };
    companyVaultState = loaded;
    saveVaultToDisk(loaded);
    return loaded;
  } catch {
    return null;
  }
}
async function writeVaultToFirestoreRest(idToken, state, uid) {
  if (!idToken || process.env.NODE_ENV?.toLowerCase() === "test" || idToken.startsWith("test-jwt:")) return false;
  try {
    const fields = {
      updatedAt: { stringValue: state.updatedAt },
      updatedByEmail: { stringValue: state.updatedByEmail || "" },
      authorizedEmails: {
        arrayValue: {
          values: state.authorizedEmails.map((email) => ({ stringValue: email }))
        }
      }
    };
    if (uid) {
      fields.updatedByUid = { stringValue: uid };
    }
    if (state.saltHex && state.saltHex.length >= 16 && state.verifierHex && state.verifierHex.length >= 16) {
      fields.saltHex = { stringValue: state.saltHex };
      fields.verifierHex = { stringValue: state.verifierHex };
    }
    const res = await fetch(`${FIRESTORE_REST_BASE}/vault/company`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ fields })
    });
    for (const email of state.authorizedEmails) {
      const docId = email.trim().toLowerCase().replace(/@/g, "_at_").replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 120);
      if (!docId) continue;
      await fetch(`${FIRESTORE_REST_BASE}/employees/${docId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          fields: {
            email: { stringValue: email },
            role: { stringValue: isAdminEmail(email) ? "admin" : "employee" },
            updatedAt: { stringValue: state.updatedAt },
            addedByEmail: { stringValue: state.updatedByEmail || "" },
            ...uid ? { addedByUid: { stringValue: uid } } : {}
          }
        })
      }).catch(() => {
      });
    }
    return res.ok;
  } catch {
    return false;
  }
}
var FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
var genAIClient = null;
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return genAIClient;
}
async function generateStrictJson(ai, params) {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: params.contents,
    config: {
      systemInstruction: params.systemInstruction,
      responseMimeType: "application/json",
      responseSchema: params.responseSchema
    }
  });
  const parsed = JSON.parse(response.text || "{}");
  return { parsed, modelUsed: GEMINI_MODEL };
}
async function verifyFirebaseToken(idToken) {
  if (!idToken || typeof idToken !== "string") return null;
  if (process.env.NODE_ENV?.toLowerCase() === "test" && idToken.startsWith("test-jwt:")) {
    const parts = idToken.split(":");
    if (parts.length >= 3) {
      return {
        email: parts[1].trim(),
        uid: parts[2].trim()
      };
    }
  }
  try {
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID
    });
    const uid = payload.sub || payload.user_id;
    if (!uid) return null;
    return {
      uid,
      email: (payload.email || "").trim()
    };
  } catch {
    return null;
  }
}
async function requireAuth(req, res, next) {
  const isProduction = process.env.NODE_ENV?.toLowerCase() === "production";
  if (process.env.ALLOW_UNAUTHENTICATED_API === "true") {
    if (isProduction) {
      console.warn("[Security] WARN: ALLOW_UNAUTHENTICATED_API is active but strictly ignored in production mode.");
    } else {
      req.authUser = {
        uid: "dev-mock-uid",
        email: "dev@kaubit.de",
        isAdmin: true
      };
      next();
      return;
    }
  }
  const authHeader = req.headers.authorization;
  const bodyToken = req.body?.idToken;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : bodyToken;
  const decoded = token ? await verifyFirebaseToken(token) : null;
  if (!decoded || !decoded.uid) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Nicht autorisiert. Bitte melden Sie sich mit Ihrem Google-Konto an."
    });
    return;
  }
  const userEmail = (decoded.email || "").trim().toLowerCase();
  if (!userEmail || !isAuthorizedEmail(userEmail)) {
    res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Zugriff verweigert: Ihre E-Mail-Adresse ist nicht f\xFCr dieses Unternehmens-Portal freigeschaltet."
    });
    return;
  }
  req.authUser = {
    uid: decoded.uid,
    email: userEmail,
    isAdmin: isAdminEmail(userEmail)
  };
  next();
}
app.get("/api/auth/status", (_req, res) => {
  res.json({
    firebaseAuthEnabled: true,
    projectId: FIREBASE_PROJECT_ID,
    firestoreDatabaseId: FIRESTORE_DATABASE_ID
  });
});
app.post("/api/auth/verify-session", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.idToken;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : bodyToken;
    const decoded = token ? await verifyFirebaseToken(token) : null;
    if (!decoded || !decoded.email) {
      return res.status(401).json({
        success: false,
        isAuthorized: false,
        message: "Keine g\xFCltige Firebase-Authentifizierung \xFCbermittelt."
      });
    }
    if (token) {
      await fetchVaultFromFirestoreRest(token);
    }
    const userEmail = decoded.email.trim().toLowerCase();
    const isAuthorized = isAuthorizedEmail(userEmail);
    const isAdmin = isAdminEmail(userEmail);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        isAuthorized: false,
        message: "Zugriff verweigert: Ihr Google-Konto ist nicht f\xFCr dieses Unternehmens-Portal freigeschaltet."
      });
    }
    return res.json({
      success: true,
      isAuthorized: true,
      isAdmin,
      email: userEmail,
      userId: decoded.uid,
      hasPassphraseConfigured: Boolean(companyVaultState?.saltHex && companyVaultState?.verifierHex),
      saltHex: companyVaultState?.saltHex || null,
      verifierHex: companyVaultState?.verifierHex || null,
      authorizedEmails: getEffectiveAuthorizedEmails(),
      updatedAt: companyVaultState?.updatedAt || null,
      message: "Authentifizierung erfolgreich."
    });
  } catch (err) {
    console.error("Error verifying session:", err);
    return res.status(500).json({
      success: false,
      isAuthorized: false,
      message: sanitizeErrorMessage("Serverfehler bei der Sitzungsverifikation", err)
    });
  }
});
app.post("/api/auth/save-passphrase-verifier", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { idToken, saltHex, verifierHex, authorizedEmails } = req.body;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : idToken;
    const decoded = token ? await verifyFirebaseToken(token) : null;
    if (!decoded || !decoded.email) {
      return res.status(401).json({
        success: false,
        message: "Nicht authentifiziert."
      });
    }
    if (!isAdminEmail(decoded.email)) {
      return res.status(403).json({
        success: false,
        message: "Nur der Administrator darf die Unternehmens-Passphrase oder Mitarbeiter-Konten verwalten."
      });
    }
    const HEX_REGEX = /^[0-9a-fA-F]{16,512}$/;
    if (!saltHex || !verifierHex || typeof saltHex !== "string" || typeof verifierHex !== "string" || !HEX_REGEX.test(saltHex.trim()) || !HEX_REGEX.test(verifierHex.trim())) {
      return res.status(400).json({ success: false, message: "Fehlende oder ung\xFCltige Kryptografie-Parameter (Hex-Format erforderlich)." });
    }
    const effectiveSalt = saltHex.trim();
    const effectiveVerifier = verifierHex.trim();
    const validNewEmails = Array.isArray(authorizedEmails) ? authorizedEmails.map((e) => String(e || "").trim().toLowerCase()).filter((e) => EMAIL_REGEX.test(e)) : getEffectiveAuthorizedEmails();
    const mergedEmails = Array.from(
      /* @__PURE__ */ new Set([
        ...Array.from(getAdminEmails()),
        ...validNewEmails
      ])
    );
    companyVaultState = {
      saltHex: effectiveSalt,
      verifierHex: effectiveVerifier,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedByEmail: decoded.email,
      authorizedEmails: mergedEmails
    };
    saveVaultToDisk(companyVaultState);
    const persistedToFirestore = token ? await writeVaultToFirestoreRest(token, companyVaultState, decoded.uid) : false;
    return res.json({
      success: true,
      authorizedEmails: mergedEmails,
      persistedToFirestore,
      message: "Unternehmens-Verschl\xFCsselungsphrase und Mitarbeiter-Freigaben erfolgreich gesichert."
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: sanitizeErrorMessage("Fehler beim Speichern der Passphrase", err)
    });
  }
});
app.post("/api/auth/manage-employees", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { idToken, saltHex, verifierHex, authorizedEmails } = req.body;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : idToken;
    const decoded = token ? await verifyFirebaseToken(token) : null;
    if (!decoded || !decoded.email) {
      return res.status(401).json({
        success: false,
        message: "Nicht authentifiziert."
      });
    }
    if (!isAdminEmail(decoded.email)) {
      return res.status(403).json({
        success: false,
        message: "Nur der Administrator kann Mitarbeiter-Konten anlegen oder entfernen."
      });
    }
    const validNewEmails = Array.isArray(authorizedEmails) ? authorizedEmails.map((e) => String(e || "").trim().toLowerCase()).filter((e) => EMAIL_REGEX.test(e)) : [];
    const mergedEmails = Array.from(
      /* @__PURE__ */ new Set([
        ...Array.from(getAdminEmails()),
        ...validNewEmails
      ])
    );
    companyVaultState = {
      saltHex: String(saltHex || companyVaultState?.saltHex || "").trim(),
      verifierHex: String(verifierHex || companyVaultState?.verifierHex || "").trim(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedByEmail: decoded.email,
      authorizedEmails: mergedEmails
    };
    saveVaultToDisk(companyVaultState);
    const persistedToFirestore = token ? await writeVaultToFirestoreRest(token, companyVaultState, decoded.uid) : false;
    return res.json({
      success: true,
      authorizedEmails: mergedEmails,
      persistedToFirestore,
      message: "Mitarbeiter-Konten aktualisiert."
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: sanitizeErrorMessage("Fehler bei der Mitarbeiter-Verwaltung", err)
    });
  }
});
var MAX_PDF_BYTES = 20 * 1024 * 1024;
var ALLOWED_DOCUMENT_TYPES = ["sdb", "pruefbericht", "tm", "allgemein"];
function sanitizeFilename(rawFilename, fallback = "Dokument.pdf") {
  if (typeof rawFilename !== "string") return fallback;
  const normalized = rawFilename.replace(/\\/g, "/");
  const base = path.posix.basename(normalized);
  const noNulls = base.replace(/[\x00-\x1F\x7F]/g, "");
  const noTraversal = noNulls.replace(/^\.+/, "");
  const safeChars = noTraversal.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cleaned = safeChars.replace(/_{2,}/g, "_").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return fallback;
  }
  return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned;
}
function resolveDocumentType(rawType, fallback = "allgemein") {
  if (typeof rawType !== "string") return fallback;
  const normalized = rawType.trim().toLowerCase();
  if (ALLOWED_DOCUMENT_TYPES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}
function validateAndDecodePdf(pdfBase64) {
  if (pdfBase64 === void 0 || pdfBase64 === null) {
    return {
      isValid: false,
      statusCode: 400,
      code: "INVALID_PDF",
      message: "Keine PDF-Datei \xFCbermittelt."
    };
  }
  if (typeof pdfBase64 !== "string") {
    return {
      isValid: false,
      statusCode: 400,
      code: "INVALID_PDF",
      message: "Ung\xFCltiges \xDCbertragungsformat f\xFCr PDF-Datei."
    };
  }
  const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/i, "").trim();
  if (!cleanBase64) {
    return {
      isValid: false,
      statusCode: 400,
      code: "EMPTY_FILE",
      message: "Die \xFCbermittelte Datei ist leer."
    };
  }
  let buffer;
  try {
    buffer = Buffer.from(cleanBase64, "base64");
  } catch {
    return {
      isValid: false,
      statusCode: 400,
      code: "INVALID_PDF",
      message: "Ung\xFCltiges Base64-Format f\xFCr PDF-Dokument."
    };
  }
  if (buffer.length === 0) {
    return {
      isValid: false,
      statusCode: 400,
      code: "EMPTY_FILE",
      message: "Die \xFCbermittelte Datei ist leer (0 Bytes)."
    };
  }
  if (buffer.length > MAX_PDF_BYTES) {
    return {
      isValid: false,
      statusCode: 400,
      code: "PAYLOAD_TOO_LARGE",
      message: "Die PDF-Datei \xFCberschreitet die maximale Gr\xF6\xDFe von 20 MB."
    };
  }
  if (!hasPdfMagicBytes(buffer)) {
    return {
      isValid: false,
      statusCode: 400,
      code: "INVALID_PDF",
      message: "Ung\xFCltiges Dateiformat. Die Datei enth\xE4lt keine g\xFCltige PDF-Signatur (%PDF-)."
    };
  }
  return {
    isValid: true,
    buffer,
    cleanBase64
  };
}
app.get("/api/standards/defaults", (_req, res) => {
  res.json({
    success: true,
    standards: INITIAL_SUSTAINABILITY_STANDARDS
  });
});
app.post("/api/standards/parse-guideline-pdf", requireAuth, async (req, res) => {
  try {
    const { pdfBase64, filename } = req.body;
    const hasUploadedPdf = pdfBase64 !== void 0 && pdfBase64 !== null;
    if (!hasUploadedPdf) {
      return res.json({
        success: true,
        standardName: "DGNB Kriterienmatrix ENV1.2 (Neubau 2023)",
        institute: "Deutsche Gesellschaft f\xFCr Nachhaltiges Bauen (DGNB)",
        version: "2023",
        matrix: DEFAULT_DGNB_ENV12_MATRIX,
        source: "default-catalog"
      });
    }
    const pdfCheck = validateAndDecodePdf(pdfBase64);
    if (!pdfCheck.isValid) {
      return res.status(pdfCheck.statusCode).json({
        success: false,
        code: pdfCheck.code,
        message: pdfCheck.message
      });
    }
    const safeFilename = sanitizeFilename(filename, "Leitfaden.pdf");
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        success: false,
        code: "AI_UNAVAILABLE",
        message: "KI-Service ist nicht verf\xFCgbar (GEMINI_API_KEY nicht konfiguriert). Das hochgeladene Leitfaden-PDF kann derzeit nicht automatisch ausgelesen werden."
      });
    }
    const { pages, hasTextLayer } = await extractPdfPages(pdfCheck.buffer);
    const prompt = `Du bist ein Fachexperte f\xFCr Bau\xF6kologie und Nachhaltigkeits-Zertifizierungssysteme im Bauwesen (DGNB, QNG, BNB, LEED, BREEAM, NaWoh).
Analysiere das beigef\xFCgte Leitfaden-/Kriteriendokument ("${safeFilename}").
WICHTIG:
- Extrahiere ausschlie\xDFlich Zeilen und Werte, die tats\xE4chlich im PDF stehen.
- Wenn ein Feld (z. B. bezugsnorm, anwendungsbereich, geltungsbereich) in einer Zeile nicht angegeben ist, gib einen leeren String "" zur\xFCck. Erfinde KEINE Platzhalter wie "DIN EN / ISO Norm".
- \xDCbernimm Grenzwerte in qs1 bis qs4 wortgetreu aus der Tabelle des Dokuments.
Extrahiere:
1. Den genauen Namen des Standards/Kriteriums.
2. Das herausgebende Institut bzw. die Einrichtung.
3. Die Versionsnummer oder das Ausgabejahr.
4. Die vollst\xE4ndige Kriterienmatrix mit allen Zeilen.`;
    const { parsed, modelUsed } = await generateStrictJson(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfCheck.cleanBase64
            }
          },
          { text: prompt }
        ]
      },
      systemInstruction: "Du antwortest ausschlie\xDFlich als valides JSON entsprechend des vorgegebenen Schemas. Erfinde niemals Zeilen oder Standardwerte, die nicht im Dokument stehen.",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          standardName: { type: Type.STRING },
          institute: { type: Type.STRING },
          version: { type: Type.STRING },
          matrix: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                nr: { type: Type.STRING },
                bauteil: { type: Type.STRING },
                kategorie: { type: Type.STRING },
                anwendungsbereich: { type: Type.STRING },
                betrachteteStoffe: { type: Type.STRING },
                bezugsnorm: { type: Type.STRING },
                qs1: { type: Type.STRING },
                qs2: { type: Type.STRING },
                qs3: { type: Type.STRING },
                qs4: { type: Type.STRING },
                artDokumentation: { type: Type.STRING },
                geltungsbereich: { type: Type.STRING }
              },
              required: ["nr", "bauteil", "betrachteteStoffe", "qs1", "qs2", "qs3", "qs4"]
            }
          }
        },
        required: ["standardName", "institute", "version", "matrix"]
      }
    });
    if (!parsed.matrix || !Array.isArray(parsed.matrix) || parsed.matrix.length === 0) {
      return res.status(422).json({
        success: false,
        code: "EMPTY_MATRIX",
        message: `Im hochgeladenen Dokument "${filename || "PDF"}" konnte keine Kriterienmatrix erkannt werden.`
      });
    }
    const warnings = [];
    if (!hasTextLayer) {
      warnings.push(
        "Das Leitfaden-PDF enth\xE4lt keinen maschinenlesbaren Textlayer (Scan). Bitte pr\xFCfen Sie alle extrahierten Grenzwerte manuell."
      );
    }
    if (parsed.matrix.length < 3) {
      warnings.push(
        `Es wurden nur ${parsed.matrix.length} Kriterienzeile(n) erkannt \u2013 bitte Vollst\xE4ndigkeit des Leitfadens pr\xFCfen.`
      );
    }
    let unverifiedRows = 0;
    const cleanedMatrix = parsed.matrix.map((row, i) => {
      const qsCombined = `${row.qs1 || ""} ${row.qs2 || ""} ${row.qs3 || ""} ${row.qs4 || ""}`.trim();
      if (hasTextLayer && qsCombined.length > 0) {
        const v = verifyQuote(qsCombined, qsCombined, pages);
        if (v.verification === "unverified") {
          unverifiedRows++;
        }
      }
      return {
        id: row.id || `scanned-${i + 1}`,
        nr: String(row.nr || i + 1).trim(),
        bauteil: String(row.bauteil || "").trim(),
        kategorie: String(row.kategorie || "").trim() || void 0,
        anwendungsbereich: String(row.anwendungsbereich || "").trim(),
        betrachteteStoffe: String(row.betrachteteStoffe || "").trim(),
        bezugsnorm: String(row.bezugsnorm || "").trim(),
        qs1: String(row.qs1 || "").trim(),
        qs2: String(row.qs2 || "").trim(),
        qs3: String(row.qs3 || "").trim(),
        qs4: String(row.qs4 || "").trim(),
        artDokumentation: String(row.artDokumentation || "").trim(),
        geltungsbereich: String(row.geltungsbereich || "").trim()
      };
    });
    if (unverifiedRows > 0) {
      warnings.push(
        `Bei ${unverifiedRows} von ${cleanedMatrix.length} Zeile(n) konnten Zahlenwerte aus QS 1\u20134 nicht eindeutig im PDF-Textlayer best\xE4tigt werden \u2013 bitte pr\xFCfen.`
      );
    }
    return res.json({
      success: true,
      standardName: parsed.standardName || safeFilename.replace(/\.pdf$/i, "") || "Gescannter Nachhaltigkeitsstandard",
      institute: parsed.institute || "Nicht im Leitfaden angegeben",
      version: parsed.version || "",
      matrix: cleanedMatrix,
      warnings,
      source: modelUsed
    });
  } catch (err) {
    console.error("Error scanning PDF guideline:", err);
    const isDocumentError = err?.status === 400 || err?.message?.includes("INVALID_ARGUMENT") || err?.message?.includes("Invalid PDF structure") || err?.message?.includes("Failed to parse");
    if (isDocumentError) {
      return res.status(400).json({
        success: false,
        code: "INVALID_PDF",
        message: "Das \xFCbermittelte PDF-Dokument ist besch\xE4digt oder kann nicht gelesen werden."
      });
    }
    return res.status(502).json({
      success: false,
      code: "AI_FAILED",
      message: sanitizeErrorMessage(
        "Fehler beim KI-Scan des Leitfaden-PDFs: Die Datei konnte nicht verarbeitet werden. Es wurde kein Standard \xFCberschrieben.",
        err
      )
    });
  }
});
app.post("/api/dgnb/parse-guideline-pdf", (_req, res) => {
  return res.redirect(307, "/api/standards/parse-guideline-pdf");
});
app.post("/api/documents/parse-pdf", requireAuth, async (req, res) => {
  try {
    const { pdfBase64, documentType, filename } = req.body;
    const pdfCheck = validateAndDecodePdf(pdfBase64);
    if (!pdfCheck.isValid) {
      return res.status(pdfCheck.statusCode).json({
        success: false,
        code: pdfCheck.code,
        message: pdfCheck.message
      });
    }
    const safeFilename = sanitizeFilename(filename, "Dokument.pdf");
    const safeDocType = resolveDocumentType(documentType, "sdb");
    const { pages, hasTextLayer } = await extractPdfPages(pdfCheck.buffer);
    const excerpts = buildExcerpts(pages);
    const ai = getGeminiClient();
    if (!ai) {
      if (process.env.NODE_ENV?.toLowerCase() === "test") {
        const fullText = pages.join("\n");
        const vocFinding = parseVoc(fullText);
        const svhcFinding = evaluateSvhc(fullText);
        const certs = canonicalCertificates(fullText);
        return res.json({
          success: true,
          extracted: {
            documentType: safeDocType,
            filename: safeFilename,
            productName: fullText.split("\n")[0]?.slice(0, 60)?.trim() || "Gepr\xFCftes Testprodukt",
            manufacturer: "Hersteller laut Deklaration",
            suggestedCriteriaNr: safeDocType === "tm" ? "8" : "2",
            suggestionReason: "Deterministische Extraktion im Testmodus",
            vocContent: vocFinding.found ? `${vocFinding.value ?? 0} g/l` : vocFinding.solventFree ? "0 g/l (l\xF6semittelfrei)" : void 0,
            vocTestDate: parseDate(fullText)?.raw,
            svhcStatus: svhcFinding.status === "none" ? "Keine SVHC > 0,1 % w/w" : void 0,
            certificates: certs,
            hasBauteilekatalog: true,
            summarySnippet: excerpts.map((e) => `[Seite ${e.page}] ${e.text}`).join("\n") || `[Dokument "${safeFilename}"] Textlayer analysiert.`,
            fieldQuotes: [],
            excerpts,
            hasTextLayer,
            warnings: []
          },
          source: "offline-test-extractor"
        });
      }
      return res.status(503).json({
        success: false,
        code: "AI_UNAVAILABLE",
        message: "KI-Dokumentenscan nicht verf\xFCgbar (GEMINI_API_KEY ist nicht konfiguriert). Bitte tragen Sie die Produktkennwerte manuell ein."
      });
    }
    const catalogIndex = DEFAULT_DGNB_ENV12_MATRIX.map(
      (r) => `Zeile ${r.nr}: ${r.bauteil} (${r.betrachteteStoffe})`
    ).join("\n");
    const isTm = safeDocType === "tm";
    const prompt = isTm ? `Du bist ein strenger DGNB-Auditor und Fachexperte f\xFCr Bauchemie und Technische Merkbl\xE4tter (TM / Technisches Datenblatt / Produktdatenblatt).
Analysiere die beigef\xFCgte PDF-Datei ("${safeFilename}", Dokumententyp: Technisches Merkblatt).

STRIKTE ANTI-HALLUZINATIONS-REGELN:
1. Extrahiere NUR Angaben, die w\xF6rtlich im beigef\xFCgten Technischen Merkblatt stehen.
2. Wenn ein Wert (z. B. VOC-Gehalt, Stand/Datum, GISCODE, Umweltzeichen) NICHT im Dokument steht, gib f\xFCr dieses Feld zwingend einen leeren String "" bzw. ein leeres Array [] zur\xFCck!
3. Schreibe niemals erfundene Platzhalter oder Vermutungen in die Datenfelder.
4. Kopiere f\xFCr jedes gefundene Feld in "fieldQuotes" das EXAKTE w\xF6rtliche Zitat (quote) aus dem PDF-Text.

SPEZIFISCHE EXTRAKTIONSREGELN F\xDCR TECHNISCHE MERKBL\xC4TTER:
- productName: Offizieller Produkt- oder Handelsname (z. B. Deckblatt, Kopfzeile).
- manufacturer: Hersteller, Inverkehrbringer oder Vertriebsgesellschaft.
- suggestedCriteriaNr: Ermittle die passende DGNB ENV1.2 Zeilennummer prim\xE4r anhand des beschriebenen \u201EAnwendungsbereichs\u201C / \u201EVerwendungszwecks\u201C (z. B. Verlegeklebstoff -> Zeile 8, Innenwandfarbe -> Zeile 2, Fugendichtstoff -> Zeile 11).
- suggestionReason: Kurze Begr\xFCndung f\xFCr die gew\xE4hlte Zeilennummer anhand des Anwendungsbereichs.
- vocContent: Suche unter \u201ETechnische Daten\u201C, \u201EKenndaten\u201C, \u201EZusammensetzung\u201C oder \u201E\xD6kologie\u201C. Extrahiere den tats\xE4chlichen VOC-Gehalt (z. B. "< 1 g/l", "0 g/l") oder w\xF6rtliche Aussagen zur L\xF6semittelfreiheit (z. B. "l\xF6semittelfrei nach TRGS 610", "l\xF6semittelfrei nach VdL-RL01", "VOC-frei"). Falls nur ein Richtlinien-Grenzwert genannt wird, gib ihn mit Zusatz an.
- vocTestDate: Extrahiere das Ausstellungs-, Revisions- oder Standdatum des Technischen Merkblatts (z. B. "Stand: 05/2023", "Ausgabe: M\xE4rz 2023", "15.05.2023") oder ein zitiertes Pr\xFCfberichtsdatum.
- svhcStatus: Aussagen zu SVHC, REACH-Konformit\xE4t oder Ausschluss von Schadstoffen (z. B. "Frei von SVHC", "weichmacherfrei", "konservierungsmittelfrei"). Falls keine Angabe vorhanden, "" zur\xFCckgeben.
- certificates: Array aller genannten GISCODES (z. B. "GISCODE D1", "GISCODE RS10", "GISCODE BSW10"), Umweltzeichen (z. B. "EMICODE EC1 PLUS", "Blauer Engel DE-UZ 102", "natureplus") und Pr\xFCfnormen (z. B. "AgBB-gepr\xFCft", "DIN EN 16516").

Verf\xFCgbare Zeilen der DGNB ENV1.2 Kriterienmatrix f\xFCr suggestedCriteriaNr:
${catalogIndex}

Extrahiere:
- documentType ("sdb", "pruefbericht", "tm" oder "allgemein")
- productName (Handelsname laut Deckblatt bzw. Kopfzeile, sonst "")
- manufacturer (Hersteller/Vertrieb, sonst "")
- suggestedCriteriaNr (Passende Zeilennummer aus obiger Liste als String)
- suggestionReason (Kurze Begr\xFCndung anhand des Anwendungsbereichs)
- vocContent (Exakte VOC-Angabe oder L\xF6semittelfreiheitserkl\xE4rung aus dem TM, sonst "")
- vocTestDate (Stand-, Revisions- oder Ausstellungsdatum des TMs, z. B. "Stand: 05/2023", sonst "")
- svhcStatus (Aussage zu SVHC/Schadstoffen, sonst "")
- certificates (Array im TM genannter GISCODEs, Umweltzeichen, Pr\xFCfnormen, sonst [])
- fieldQuotes (F\xFCr jedes nicht-leere Feld ein Objekt mit field, label, value, quote, pageOrSection, confidence)` : `Du bist ein strenger DGNB-Auditor und Fachexperte f\xFCr Bauchemie, Sicherheitsdatenbl\xE4tter (SDB nach REACH/CLP), Technische Merkbl\xE4tter (TM) und Emissions-Pr\xFCfberichte.
Analysiere die beigef\xFCgte PDF-Datei ("${safeFilename}", angegebener Dokumententyp: "${safeDocType}").

STRIKTE ANTI-HALLUZINATIONS-REGELN:
1. Extrahiere NUR Angaben, die w\xF6rtlich im beigef\xFCgten PDF-Dokument stehen.
2. Wenn ein Wert (z. B. VOC-Gehalt, Pr\xFCfdatum, SVHC-Aussage, Umweltzeichen) NICHT im PDF steht, gib f\xFCr dieses Feld zwingend einen leeren String "" bzw. ein leeres Array [] zur\xFCck!
3. Schreibe niemals Platzhalter wie "Kein Nachweis" oder erfundene Beispielwerte (wie "< 1 g/l" oder "EMICODE EC1 PLUS") in die Datenfelder.
4. Verwechsle in SDB Abschnitt 15 genannte gesetzliche EU-Decopaint-Grenzwerte ("Kat. A/a: 30 g/l") NICHT mit dem tats\xE4chlichen Produkt-VOC-Gehalt. Wenn nur der gesetzliche Grenzwert genannt wird, gib ihn mit dem Zusatz "Gesetzlicher Grenzwert:" an oder lasse vocContent leer, falls kein Produktwert existiert.
5. Kopiere f\xFCr jedes gefundene Feld in "fieldQuotes" das EXAKTE w\xF6rtliche Zitat (quote) aus dem PDF-Text.

Verf\xFCgbare Zeilen der DGNB ENV1.2 Kriterienmatrix f\xFCr suggestedCriteriaNr:
${catalogIndex}

Extrahiere:
- documentType ("sdb", "pruefbericht", "tm" oder "allgemein")
- productName (Handelsname laut Abschnitt 1 bzw. Deckblatt, sonst "")
- manufacturer (Hersteller/Lieferant laut Abschnitt 1.3 bzw. Deckblatt, sonst "")
- suggestedCriteriaNr (Passende Zeilennummer aus obiger Liste als String, z. B. "2" f\xFCr Innenwandfarben, "8" f\xFCr Verlegeklebstoffe, "11" f\xFCr Fugendichtstoffe Innen)
- suggestionReason (Kurze Begr\xFCndung f\xFCr die gew\xE4hlte Zeilennummer anhand des Produkttyps)
- vocContent (Exakte VOC-Angabe des Produkts aus dem PDF, sonst "")
- vocTestDate (Pr\xFCf- oder Ausstellungsdatum des VOC-/Emissionsberichts, z. B. "15.05.2023", sonst "")
- svhcStatus (Exakte Aussage zu REACH SVHC / Kandidatenliste Abschnitt 3 oder 15, sonst "")
- certificates (Array tats\xE4chlich im PDF genannter Umwelt-/Pr\xFCfzeichen wie "Blauer Engel DE-UZ 102", "EMICODE EC1 PLUS", "GISCODE D1", sonst [])
- fieldQuotes (F\xFCr jedes nicht-leere Feld ein Objekt mit field, label, value, quote [w\xF6rtliches Zitat aus dem PDF], pageOrSection, confidence)`;
    const { parsed, modelUsed } = await generateStrictJson(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfCheck.cleanBase64
            }
          },
          { text: prompt }
        ]
      },
      systemInstruction: 'Du bist ein pr\xE4zises Extraktionssystem ohne jegliche Halluzination. Nicht im PDF enthaltene Felder bleiben leer (""). Jedes extrahierte Feld muss durch ein w\xF6rtliches Zitat aus dem PDF belegt werden.',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          documentType: { type: Type.STRING },
          productName: { type: Type.STRING },
          manufacturer: { type: Type.STRING },
          suggestedCriteriaNr: { type: Type.STRING },
          suggestionReason: { type: Type.STRING },
          vocContent: { type: Type.STRING },
          vocTestDate: { type: Type.STRING },
          svhcStatus: { type: Type.STRING },
          certificates: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          fieldQuotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                field: { type: Type.STRING },
                label: { type: Type.STRING },
                value: { type: Type.STRING },
                quote: { type: Type.STRING },
                pageOrSection: { type: Type.STRING },
                confidence: { type: Type.STRING }
              },
              required: ["field", "label", "value", "quote"]
            }
          }
        },
        required: [
          "documentType",
          "productName",
          "manufacturer",
          "suggestedCriteriaNr",
          "vocContent",
          "vocTestDate",
          "svhcStatus",
          "certificates",
          "fieldQuotes"
        ]
      }
    });
    const rawQuotes = Array.isArray(parsed.fieldQuotes) ? parsed.fieldQuotes : [];
    const fieldDefinitions = [
      { field: "productName", label: "Produktname / Handelsname", value: String(parsed.productName || "").trim() },
      { field: "manufacturer", label: "Hersteller / Inverkehrbringer", value: String(parsed.manufacturer || "").trim() },
      { field: "vocContent", label: "VOC-Gehalt / L\xF6semittelanteil", value: String(parsed.vocContent || "").trim() },
      { field: "vocTestDate", label: "Datum VOC-Pr\xFCfbericht", value: String(parsed.vocTestDate || "").trim() },
      { field: "svhcStatus", label: "SVHC / REACH-Kandidatenliste", value: String(parsed.svhcStatus || "").trim() },
      {
        field: "certificates",
        label: "Umweltzeichen & Pr\xFCfnachweise",
        value: Array.isArray(parsed.certificates) ? parsed.certificates.filter(Boolean).join(", ") : ""
      }
    ];
    const verifiedQuotes = [];
    const warnings = [];
    if (!hasTextLayer) {
      warnings.push(
        "Das hochgeladene PDF enth\xE4lt keinen maschinenlesbaren Textlayer (Scan-Dokument). Alle extrahierten Werte stammen aus der visuellen Texterkennung und m\xFCssen manuell gepr\xFCft werden."
      );
    }
    for (const def of fieldDefinitions) {
      const existing = rawQuotes.find((q) => q.field === def.field);
      const val = def.value || String(existing?.value || "").trim();
      if (!val) continue;
      const quoteText = String(existing?.quote || val).trim();
      const vResult = verifyQuote(quoteText, val, pages);
      const pageLabel = vResult.page ? `Seite ${vResult.page}` : existing?.pageOrSection || void 0;
      verifiedQuotes.push({
        field: def.field,
        label: existing?.label || def.label,
        value: val,
        quote: quoteText,
        pageOrSection: pageLabel,
        confidence: vResult.verification === "verified" ? "high" : vResult.verification === "partial" ? "medium" : "low",
        verification: vResult.verification,
        page: vResult.page
      });
      if (vResult.verification === "unverified") {
        warnings.push(
          `Feld \u201E${def.label}\u201C (${val}): Zitat konnte im PDF-Textlayer nicht verifiziert werden \u2013 bitte im Originaldokument pr\xFCfen.`
        );
      }
    }
    let verbatimSummary = "";
    if (excerpts.length > 0) {
      verbatimSummary = excerpts.map((e) => `[Seite ${e.page}] ${e.text}`).join("\n");
    } else if (verifiedQuotes.some((q) => q.verification === "verified" || q.verification === "partial")) {
      verbatimSummary = verifiedQuotes.filter((q) => q.verification === "verified" || q.verification === "partial").map((q) => `[${q.page ? `Seite ${q.page}` : "PDF"}] ${q.label}: \u201E${q.quote}\u201C`).join("\n");
    } else {
      verbatimSummary = `[Dokument "${safeFilename}"] Kein direkter Textlayer-Auszug verf\xFCgbar.`;
    }
    const validCriteriaNr = DEFAULT_DGNB_ENV12_MATRIX.some((r) => r.nr === String(parsed.suggestedCriteriaNr || "").trim()) ? String(parsed.suggestedCriteriaNr).trim() : "2";
    return res.json({
      success: true,
      extracted: {
        documentType: resolveDocumentType(parsed.documentType, safeDocType),
        filename: safeFilename,
        productName: String(parsed.productName || "").trim(),
        manufacturer: String(parsed.manufacturer || "").trim(),
        suggestedCriteriaNr: validCriteriaNr,
        suggestionReason: String(parsed.suggestionReason || "").trim() || void 0,
        vocContent: String(parsed.vocContent || "").trim() || void 0,
        vocTestDate: String(parsed.vocTestDate || "").trim() || void 0,
        svhcStatus: String(parsed.svhcStatus || "").trim() || void 0,
        certificates: Array.isArray(parsed.certificates) ? parsed.certificates.filter(Boolean) : [],
        hasBauteilekatalog: true,
        // Supplier QNG-ready default (documented as assumption)
        summarySnippet: verbatimSummary,
        fieldQuotes: verifiedQuotes,
        excerpts,
        hasTextLayer,
        warnings
      },
      source: modelUsed
    });
  } catch (err) {
    console.error("Error parsing document PDF via Gemini:", err);
    const isDocumentError = err?.status === 400 || err?.message?.includes("INVALID_ARGUMENT") || err?.message?.includes("Invalid PDF structure") || err?.message?.includes("Failed to parse");
    if (isDocumentError) {
      return res.status(400).json({
        success: false,
        code: "INVALID_PDF",
        message: "Das \xFCbermittelte PDF-Dokument ist besch\xE4digt oder kann nicht gelesen werden."
      });
    }
    return res.status(502).json({
      success: false,
      code: "AI_FAILED",
      message: sanitizeErrorMessage(
        "KI-Dokumentenscan fehlgeschlagen: Das PDF konnte nicht analysiert werden. Bitte pr\xFCfen Sie die Datei oder geben Sie die Werte manuell ein.",
        err
      )
    });
  }
});
app.post("/api/standards/analyze-product", requireAuth, async (req, res) => {
  try {
    const {
      productName,
      manufacturer,
      criteriaRowNr,
      sdbText,
      tmText,
      testReportText,
      vocTestDate,
      hasBauteilekatalog,
      projectTitle,
      userEmail,
      selectedStandardCodes = ["DGNB"],
      standards = [],
      structuredInput
    } = req.body;
    const targetStandards = Array.isArray(selectedStandardCodes) && selectedStandardCodes.length > 0 ? selectedStandardCodes : ["DGNB"];
    const identifiedProductName = productName?.trim() || "Gepr\xFCftes Bauprodukt";
    const identifiedManufacturer = manufacturer?.trim() || "Hersteller laut Deklaration";
    const bauteilekatalogActive = hasBauteilekatalog ?? true;
    const evaluations = {};
    const clientStandards = Array.isArray(standards) ? standards : [];
    const getMatrixForCode = (code, fallback) => {
      const found = clientStandards.find((s) => s.code === code);
      return found && Array.isArray(found.criteriaRows) && found.criteriaRows.length > 0 ? found.criteriaRows : fallback;
    };
    const dgnbMatrix = getMatrixForCode("DGNB", DEFAULT_DGNB_ENV12_MATRIX);
    const qngMatrix = getMatrixForCode("QNG", DEFAULT_QNG_MATRIX);
    const bnbMatrix = getMatrixForCode("BNB", DEFAULT_BNB_MATRIX);
    const dgnbRow = dgnbMatrix.find((r) => r.nr === String(criteriaRowNr)) || dgnbMatrix[0];
    const qngRef = dgnbRow?.qngRefNr || String(criteriaRowNr || "");
    const qngRow = qngMatrix.find((r) => r.nr === qngRef || r.nr === String(criteriaRowNr)) || null;
    const bnbRef = dgnbRow?.bnbRefNr || String(criteriaRowNr || "");
    const bnbRow = bnbMatrix.find((r) => r.nr === bnbRef || r.nr === String(criteriaRowNr)) || null;
    const combinedText = [sdbText, tmText, testReportText].filter(Boolean).join("\n").trim();
    const confirmedEvidence = structuredInput?.evidence || {};
    const vocTextInput = [structuredInput?.vocContent, combinedText].filter(Boolean).join("\n");
    const certsTextInput = [
      ...structuredInput?.certificates || [],
      structuredInput?.vocContent || "",
      combinedText
    ].filter(Boolean).join("\n");
    const svhcTextInput = [structuredInput?.svhcStatus, combinedText].filter(Boolean).join("\n");
    const extractedDateFromText = combinedText.match(
      /(?:prüfdatum|testdatum|datum der prüfung|ausgestellt am|prüfbericht vom|stand(?:datum)?|ausgabe(?:datum)?|überarbeitet am)[^\d\n]{0,25}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\b(?:19|20)\d\d\b)/i
    )?.[1] || (tmText ? parseDate(tmText)?.raw : "") || "";
    const dateInput = (structuredInput?.vocTestDate || vocTestDate || extractedDateFromText || "").trim();
    const vocFinding = parseVoc(vocTextInput);
    const productCerts = canonicalCertificates(certsTextInput);
    const svhcFinding = evaluateSvhc(svhcTextInput);
    const testDateEval = evaluateTestDateAge(dateInput);
    for (const code of targetStandards) {
      let stdName = code;
      let institute = "Zertifizierungsinstitut";
      let criteriaTitle = "Kriterienmatrix";
      let criteriaNr = "1";
      let activeRow = null;
      const stdNotes = [];
      if (code === "DGNB") {
        const stdMeta = clientStandards.find((s) => s.code === "DGNB");
        stdName = stdMeta?.name || "DGNB ENV1.2 (Neubau 2023)";
        institute = stdMeta?.institute || "Deutsche Gesellschaft f\xFCr Nachhaltiges Bauen (DGNB)";
        activeRow = dgnbRow;
        criteriaTitle = activeRow.bauteil;
        criteriaNr = `Zeile ${activeRow.nr}`;
      } else if (code === "QNG") {
        const stdMeta = clientStandards.find((s) => s.code === "QNG");
        stdName = stdMeta?.name || "QNG Anhang 313 (Siegel 2023/2024)";
        institute = stdMeta?.institute || "BMWSB / BiRN (Bundesf\xF6rderung KfW)";
        activeRow = qngRow;
        if (activeRow) {
          criteriaTitle = activeRow.bauteil;
          criteriaNr = `Pos. ${activeRow.nr}`;
        } else {
          criteriaTitle = `Keine direkte QNG-Entsprechung f\xFCr DGNB Zeile ${dgnbRow.nr}`;
          criteriaNr = `Ref. ${qngRef || "unbekannt"}`;
          stdNotes.push(
            `F\xFCr DGNB Zeile ${dgnbRow.nr} (${dgnbRow.bauteil}) wurde keine passende Zeile in der QNG-Matrix gefunden \u2013 manuelle Zuordnung erforderlich.`
          );
        }
      } else if (code === "BNB") {
        const stdMeta = clientStandards.find((s) => s.code === "BNB");
        stdName = stdMeta?.name || "BNB Neubau 1.1.6 (Bundesbau)";
        institute = stdMeta?.institute || "Bundesinstitut f\xFCr Bau-, Stadt- und Raumforschung (BBSR)";
        activeRow = bnbRow;
        if (activeRow) {
          criteriaTitle = activeRow.bauteil;
          criteriaNr = `Pos. ${activeRow.nr}`;
        } else {
          criteriaTitle = `Keine direkte BNB-Entsprechung f\xFCr DGNB Zeile ${dgnbRow.nr}`;
          criteriaNr = `Ref. ${bnbRef || "unbekannt"}`;
          stdNotes.push(
            `F\xFCr DGNB Zeile ${dgnbRow.nr} (${dgnbRow.bauteil}) wurde keine passende Zeile in der BNB-Matrix gefunden \u2013 manuelle Zuordnung erforderlich.`
          );
        }
      } else {
        const customStd = clientStandards.find((s) => s.code === code);
        stdName = customStd?.name || `Individueller Standard (${code})`;
        institute = customStd?.institute || "Herausgebendes Institut";
        activeRow = customStd?.criteriaRows?.find((r) => r.nr === String(criteriaRowNr)) || customStd?.criteriaRows?.[0] || null;
        criteriaTitle = activeRow?.bauteil || "Individuelle Kriterienzeile";
        criteriaNr = activeRow?.nr ? `Pos. ${activeRow.nr}` : "1";
      }
      const vocRowEval = evaluateRowLevels(activeRow, vocFinding, productCerts);
      let vocDisplayValue;
      if (vocFinding.found || vocFinding.solventFree) {
        vocDisplayValue = formatVoc(vocFinding);
      } else if (vocFinding.onlyLimitValues) {
        vocDisplayValue = "Nur gesetzlicher Grenzwert im Dokument genannt (kein Produktmesswert)";
      } else if (vocFinding.unitMismatch) {
        vocDisplayValue = structuredInput?.vocContent?.trim() || "VOC nur in % angegeben (keine automatische Umrechnung in g/l)";
      } else if (productCerts.length > 0 && vocRowEval.achievedLevel > 1) {
        vocDisplayValue = `Nachweis \xFCber Pr\xFCfzeichen (${productCerts.join(", ")})`;
      } else {
        vocDisplayValue = "Kein Nachweis im Dokument";
      }
      let vocSource = "missing";
      if (vocFinding.found || vocFinding.solventFree) {
        const tmVoc = tmText ? parseVoc(tmText) : null;
        const sdbVoc = sdbText ? parseVoc(sdbText) : null;
        const reportVoc = testReportText ? parseVoc(testReportText) : null;
        const sdbValueMatches = Boolean(
          sdbVoc && vocFinding.found && sdbVoc.found && sdbVoc.value === vocFinding.value
        );
        const tmValueMatches = Boolean(
          tmVoc && vocFinding.found && tmVoc.found && tmVoc.value === vocFinding.value
        );
        const reportValueMatches = Boolean(
          reportVoc && vocFinding.found && reportVoc.found && reportVoc.value === vocFinding.value
        );
        if (reportValueMatches) {
          vocSource = "report";
        } else if (sdbValueMatches && !tmValueMatches) {
          vocSource = "sdb";
        } else if (tmValueMatches && !sdbValueMatches) {
          vocSource = "tm";
        } else if (tmValueMatches) {
          vocSource = "tm";
        } else if (sdbValueMatches) {
          vocSource = "sdb";
        } else if (reportVoc?.solventFree && vocFinding.solventFree) {
          vocSource = "report";
        } else if (tmVoc?.solventFree && vocFinding.solventFree) {
          vocSource = "tm";
        } else if (sdbVoc?.solventFree && vocFinding.solventFree) {
          vocSource = "sdb";
        } else if (structuredInput?.vocContent) {
          vocSource = tmText ? "tm" : sdbText ? "sdb" : "manual";
        } else {
          vocSource = sdbText ? "sdb" : "tm";
        }
      } else if (structuredInput?.vocContent) {
        vocSource = "manual";
      }
      const vocEvidence = confirmedEvidence.voc ? {
        ...confirmedEvidence.voc,
        documentType: confirmedEvidence.voc.documentType || (vocSource === "tm" ? "tm" : vocSource === "report" ? "pruefbericht" : vocSource === "sdb" ? "sdb" : "allgemein")
      } : {
        source: vocSource,
        verification: vocFinding.found || vocFinding.solventFree ? "verified" : "unverified",
        documentType: vocSource === "tm" ? "tm" : vocSource === "report" ? "pruefbericht" : vocSource === "sdb" ? "sdb" : "allgemein"
      };
      const vocNeedsReview = vocRowEval.needsManualReview || vocFinding.onlyLimitValues || vocFinding.unitMismatch || vocEvidence.verification === "unverified" || vocEvidence.verification === "partial" || vocEvidence.verification === "no-text-layer";
      const vocExplanationParts = [];
      const matchingCheck = vocRowEval.checks.find((c) => c.level === vocRowEval.achievedLevel);
      if (matchingCheck) vocExplanationParts.push(matchingCheck.reason);
      if (vocRowEval.reviewReason) vocExplanationParts.push(vocRowEval.reviewReason);
      if (vocFinding.onlyLimitValues) {
        vocExplanationParts.push(
          "Im Dokument wurde lediglich ein gesetzlicher Decopaint-Grenzwert gefunden, jedoch kein gemessener Produkt-VOC-Wert."
        );
      }
      if (vocFinding.unitMismatch) {
        vocExplanationParts.push(
          "VOC wurde in Gewichtsprozent (%) angegeben; f\xFCr den Vergleich mit g/l-Schwellen ist die Produktdichte bzw. manuelle Pr\xFCfung erforderlich."
        );
      }
      let dateSource = "missing";
      if (dateInput) {
        if (testReportText && parseDate(testReportText)) {
          dateSource = "report";
        } else if (tmText && parseDate(tmText)) {
          dateSource = "tm";
        } else if (sdbText && parseDate(sdbText)) {
          dateSource = "sdb";
        } else if (structuredInput?.vocTestDate) {
          dateSource = "manual";
        } else {
          dateSource = "report";
        }
      }
      const dateEvidence = confirmedEvidence.testDate ? {
        ...confirmedEvidence.testDate,
        documentType: confirmedEvidence.testDate.documentType || (dateSource === "tm" ? "tm" : dateSource === "report" ? "pruefbericht" : dateSource === "sdb" ? "sdb" : "allgemein")
      } : {
        source: dateSource,
        verification: dateInput ? "verified" : "unverified",
        documentType: dateSource === "tm" ? "tm" : dateSource === "report" ? "pruefbericht" : dateSource === "sdb" ? "sdb" : "allgemein"
      };
      const dateNeedsReview = Boolean(testDateEval.needsManualReview) || dateEvidence.verification === "unverified" || dateEvidence.verification === "partial" || dateEvidence.verification === "no-text-layer";
      let svhcLevel = 1;
      let svhcDisplayValue = "Kein Nachweis im Dokument";
      let svhcExplanation = "";
      let svhcNeedsReview = false;
      if (svhcFinding.status === "none") {
        svhcLevel = 4;
        svhcDisplayValue = structuredInput?.svhcStatus?.trim() || "Keine SVHC > 0,1 % w/w (REACH-konform)";
        svhcExplanation = `Negationsbewusste Pr\xFCfung best\xE4tigt: Keine besonders besorgniserregenden Stoffe (SVHC) > 0,1 % w/w deklariert${svhcFinding.evidence ? ` (\u201E${svhcFinding.evidence.slice(0, 120)}\u201C)` : ""}.`;
      } else if (svhcFinding.status === "present") {
        svhcLevel = 1;
        svhcDisplayValue = structuredInput?.svhcStatus?.trim() || "SVHC > 0,1 % w/w enthalten (K.O.-Kriterium)";
        svhcExplanation = `K.O.-Kriterium: Im Dokument sind SVHC-Stoffe > 0,1 % w/w ausgewiesen${svhcFinding.evidence ? ` (\u201E${svhcFinding.evidence.slice(0, 120)}\u201C)` : ""}.`;
      } else if (svhcFinding.status === "unclear") {
        svhcLevel = 2;
        svhcNeedsReview = true;
        svhcDisplayValue = structuredInput?.svhcStatus?.trim() || "SVHC-Aussage mehrdeutig \u2013 bitte manuell pr\xFCfen";
        svhcExplanation = `SVHC wird im Dokument erw\xE4hnt, aber ohne eindeutige Ausschluss- oder Gehaltsangabe \u2264 0,1 % w/w${svhcFinding.evidence ? ` (\u201E${svhcFinding.evidence.slice(0, 120)}\u201C)` : ""}. Bitte Abschnitt 3/15 manuell pr\xFCfen.`;
      } else {
        svhcLevel = 1;
        svhcNeedsReview = true;
        svhcDisplayValue = "Kein Nachweis im Dokument";
        svhcExplanation = "Keine explizite Aussage zur REACH-Kandidatenliste (SVHC \u2264 0,1 % w/w) im Dokument gefunden (die blo\xDFe Nennung der REACH-Verordnung gen\xFCgt nicht).";
      }
      let svhcSource = "missing";
      if (svhcFinding.status !== "missing") {
        const sdbSvhc = sdbText ? evaluateSvhc(sdbText) : null;
        const tmSvhc = tmText ? evaluateSvhc(tmText) : null;
        const reportSvhc = testReportText ? evaluateSvhc(testReportText) : null;
        if (sdbSvhc && sdbSvhc.status === svhcFinding.status) {
          svhcSource = "sdb";
        } else if (tmSvhc && tmSvhc.status === svhcFinding.status) {
          svhcSource = "tm";
        } else if (reportSvhc && reportSvhc.status === svhcFinding.status) {
          svhcSource = "report";
        } else if (sdbText && sdbSvhc && sdbSvhc.status !== "missing") {
          svhcSource = "sdb";
        } else if (tmText && tmSvhc && tmSvhc.status !== "missing") {
          svhcSource = "tm";
        } else if (testReportText && reportSvhc && reportSvhc.status !== "missing") {
          svhcSource = "report";
        } else if (structuredInput?.svhcStatus) {
          svhcSource = sdbText ? "sdb" : tmText ? "tm" : "manual";
        } else {
          svhcSource = sdbText ? "sdb" : "tm";
        }
      } else if (structuredInput?.svhcStatus) {
        svhcSource = "manual";
      }
      const svhcEvidence = confirmedEvidence.svhc ? {
        ...confirmedEvidence.svhc,
        documentType: confirmedEvidence.svhc.documentType || (svhcSource === "tm" ? "tm" : svhcSource === "report" ? "pruefbericht" : svhcSource === "sdb" ? "sdb" : "allgemein")
      } : {
        source: svhcSource,
        quote: svhcFinding.evidence,
        verification: svhcFinding.status === "missing" ? "unverified" : "verified",
        documentType: svhcSource === "tm" ? "tm" : svhcSource === "report" ? "pruefbericht" : svhcSource === "sdb" ? "sdb" : "allgemein"
      };
      if (svhcEvidence.verification === "unverified" || svhcEvidence.verification === "partial" || svhcEvidence.verification === "no-text-layer") {
        svhcNeedsReview = true;
      }
      const labelRowEval = evaluateLabelLevels(activeRow, productCerts);
      const qs4Certs = activeRow ? canonicalCertificates(activeRow.qs4 || "") : [];
      let labelDisplayValue;
      if (productCerts.length > 0) {
        labelDisplayValue = productCerts.join(", ");
      } else if (qs4Certs.length === 0 && labelRowEval.achievedLevel === 4) {
        labelDisplayValue = "Kein gesondertes Umweltzeichen in dieser Kriterienzeile gefordert";
      } else {
        labelDisplayValue = "Kein anerkanntes Umweltzeichen im Dokument nachgewiesen";
      }
      let labelSource = "missing";
      if (productCerts.length > 0) {
        if (tmText && canonicalCertificates(tmText).length > 0) {
          labelSource = "tm";
        } else if (testReportText && canonicalCertificates(testReportText).length > 0) {
          labelSource = "report";
        } else if (sdbText && canonicalCertificates(sdbText).length > 0) {
          labelSource = "sdb";
        } else if (structuredInput?.certificates && structuredInput.certificates.length > 0) {
          labelSource = tmText ? "tm" : "report";
        } else {
          labelSource = "report";
        }
      } else if (structuredInput?.certificates && structuredInput.certificates.length > 0) {
        labelSource = "manual";
      }
      const labelEvidence = confirmedEvidence.label ? {
        ...confirmedEvidence.label,
        documentType: confirmedEvidence.label.documentType || (labelSource === "tm" ? "tm" : labelSource === "report" ? "pruefbericht" : labelSource === "sdb" ? "sdb" : "allgemein")
      } : {
        source: labelSource,
        verification: productCerts.length > 0 ? "verified" : "unverified",
        documentType: labelSource === "tm" ? "tm" : labelSource === "report" ? "pruefbericht" : labelSource === "sdb" ? "sdb" : "allgemein"
      };
      const labelNeedsReview = labelRowEval.needsManualReview || productCerts.length > 0 && (labelEvidence.verification === "unverified" || labelEvidence.verification === "partial" || labelEvidence.verification === "no-text-layer");
      const labelCheck = labelRowEval.checks.find((c) => c.level === labelRowEval.achievedLevel);
      const labelExplanation = [labelCheck?.reason, labelRowEval.reviewReason].filter(Boolean).join(" ");
      const evaluatedParams = [
        {
          parameterKey: "voc",
          parameterName: "VOC-Gehalt / Stoffliche Zeilenanforderung",
          productValue: vocDisplayValue,
          requiredForQS4: activeRow ? activeRow.qs4 : "Siehe Kriterienmatrix",
          achievedLevel: vocRowEval.achievedLevel,
          isBottleneck: false,
          status: "pass",
          explanation: vocExplanationParts.join(" ") || `Erreichte Stufe: QS ${vocRowEval.achievedLevel}.`,
          evidence: vocEvidence,
          needsManualReview: vocNeedsReview
        },
        {
          parameterKey: "testDate",
          parameterName: "Alter & G\xFCltigkeit des VOC-Pr\xFCfberichts (DGNB / AgBB)",
          productValue: dateInput ? `Pr\xFCfdatum: ${dateInput}` : "Kein Pr\xFCfdatum angegeben",
          requiredForQS4: "Pr\xFCfbericht \u2264 5 Jahre alt (DGNB/AgBB-Frist)",
          achievedLevel: testDateEval.achievedLevel,
          isBottleneck: false,
          status: testDateEval.status,
          explanation: testDateEval.explanation,
          evidence: dateEvidence,
          needsManualReview: dateNeedsReview
        },
        {
          parameterKey: "svhc",
          parameterName: "Besonders besorgniserregende Stoffe (REACH SVHC)",
          productValue: svhcDisplayValue,
          requiredForQS4: "SVHC \u2264 0,1 % w/w",
          achievedLevel: svhcLevel,
          isBottleneck: false,
          status: svhcLevel >= 3 ? "pass" : svhcLevel === 2 ? "warning" : "fail",
          explanation: svhcExplanation,
          evidence: svhcEvidence,
          needsManualReview: svhcNeedsReview
        },
        {
          parameterKey: "label",
          parameterName: "Umweltzeichen & Emissionspr\xFCfungen",
          productValue: labelDisplayValue,
          requiredForQS4: qs4Certs.length > 0 ? qs4Certs.join(" / ") : activeRow ? activeRow.qs4 : "Siehe Kriterienmatrix",
          achievedLevel: labelRowEval.achievedLevel,
          isBottleneck: false,
          status: "pass",
          explanation: labelExplanation || `Erreichte Stufe: QS ${labelRowEval.achievedLevel}.`,
          evidence: labelEvidence,
          needsManualReview: labelNeedsReview
        }
      ];
      const compliance = evaluateDgnbCompliance(evaluatedParams, Boolean(bauteilekatalogActive));
      if (compliance.bauteilekatalogImpactNote) {
        stdNotes.push(compliance.bauteilekatalogImpactNote);
      }
      let ratingText = `QS ${compliance.overallLevel}`;
      if (code === "QNG") {
        ratingText = compliance.overallLevel === 4 ? "Erf\xFCllt (QNG Plus / Premium)" : compliance.overallLevel >= 2 ? "Erf\xFCllt (QNG Standard)" : "Nicht erf\xFCllt";
      } else if (code === "BNB") {
        ratingText = `QN ${compliance.overallLevel}`;
      } else if (!["DGNB", "QNG", "BNB"].includes(code)) {
        ratingText = `Stufe ${compliance.overallLevel} (${stdName})`;
      }
      const stdIsProvisional = Boolean(compliance.isProvisional || !activeRow);
      if (stdIsProvisional) {
        ratingText = `${ratingText} (vorl\xE4ufig)`;
      }
      const recommendation = compliance.overallLevel === 4 && !stdIsProvisional ? `Alle Anforderungen der H\xF6chststufe f\xFCr ${stdName} sind rechnerisch und dokumentarisch nachgewiesen.` : compliance.overallLevel === 4 && stdIsProvisional ? `Rechnerisch wird die H\xF6chststufe f\xFCr ${stdName} erreicht, jedoch sind einzelne Belege/Bedingungen als \u201Ebitte manuell pr\xFCfen\u201C markiert.` : compliance.isBauteilekatalogKO ? `F\xFCr das Erreichen der Stufen 3 und 4 muss der material\xF6kologische Bauteilekatalog aktiviert bzw. projektseitig vorgelegt werden.` : `F\xFCr eine h\xF6here Einstufung bei ${stdName} ist ein belastbarer Nachweis f\xFCr den Engpass-Parameter \u201E${compliance.bottleneckParameter?.parameterName || "Pflichtparameter"}\u201C erforderlich.`;
      evaluations[code] = {
        standardCode: code,
        standardName: stdName,
        institute,
        matchedCriteriaRowNr: criteriaNr,
        matchedCriteriaTitle: criteriaTitle,
        overallRating: ratingText,
        overallLevelNum: compliance.overallLevel,
        isCompliant: compliance.overallLevel >= 2,
        bottleneckParameter: compliance.bottleneckParameter?.parameterName,
        bottleneckReason: compliance.bottleneckReason,
        userExplanation: compliance.userExplanation,
        parameters: compliance.evaluatedParameters,
        recommendation,
        isProvisional: stdIsProvisional,
        notes: stdNotes
      };
    }
    const sortedByLevelDesc = [...targetStandards].sort(
      (a, b) => (evaluations[b]?.overallLevelNum || 0) - (evaluations[a]?.overallLevelNum || 0)
    );
    const sortedByLevelAsc = [...targetStandards].sort(
      (a, b) => (evaluations[a]?.overallLevelNum || 0) - (evaluations[b]?.overallLevelNum || 0)
    );
    const bestStandard = sortedByLevelDesc[0] || targetStandards[0];
    const criticalStandard = sortedByLevelAsc[0] || targetStandards[0];
    const anyProvisional = Object.values(evaluations).some((e) => e.isProvisional);
    const allCompliant = Object.values(evaluations).every((e) => e.isCompliant);
    const assumptions = [];
    if (bauteilekatalogActive) {
      assumptions.push(
        "QNG-ready / Bauteilekatalog-Annahme aktiv: Es wird vorausgesetzt, dass der material\xF6kologische Bauteilekatalog projektseitig gef\xFChrt wird (erforderlich f\xFCr DGNB QS 3/4)."
      );
    }
    const auditId = `QM-SUSTAIN-${(/* @__PURE__ */ new Date()).getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const auditDate = (/* @__PURE__ */ new Date()).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
    const conclusionPrefix = !allCompliant ? "Abweichungen / K.O.-Engpass festgestellt f\xFCr" : anyProvisional ? "Vorl\xE4ufiges Pr\xFCfergebnis (manuelle Nachpr\xFCfung empfohlen) f\xFCr" : "Konformit\xE4tspr\xFCfung abgeschlossen f\xFCr";
    const verifiedUser = req.authUser;
    const verifiedAuditorEmail = (verifiedUser?.email || "").trim().toLowerCase() || "auditor@bau-qm.org";
    const result = {
      productName: identifiedProductName,
      manufacturer: identifiedManufacturer,
      productType: dgnbRow?.kategorie || "Bauprodukt / Baustoff",
      hasBauteilekatalog: Boolean(bauteilekatalogActive),
      selectedStandardCodes: targetStandards,
      isProvisional: anyProvisional,
      assumptions,
      auditMetadata: {
        auditId,
        auditDate,
        auditorEmail: verifiedAuditorEmail,
        projectName: projectTitle ? projectTitle.trim() : "",
        standardsVersionSummary: targetStandards.join(", ")
      },
      standardsEvaluations: evaluations,
      synopticSummary: {
        bestStandard,
        criticalStandard,
        overallRecommendation: `Die Pr\xFCfung erfolgte deterministisch auf Basis der \xFCbergebenen und im PDF-Textlayer abgeglichenen Unterlagen gegen ${targetStandards.length} Standard(s) (${targetStandards.join(", ")}). Das Schwachstellen-Prinzip wurde auf alle 4 Pflichtparameter angewendet.`
      },
      customerReport: {
        title: anyProvisional ? "VORL\xC4UFIGES KONFORMIT\xC4TSGUTACHTEN NACHHALTIGKEIT" : "KONFORMIT\xC4TSGUTACHTEN NACHHALTIGKEIT",
        subtitle: `Pr\xFCfung gegen ${targetStandards.join(", ")}`,
        legalMandatoryNotice: anyProvisional ? "Hinweis: Mindestens ein Parameter oder Beleg ist als \u201Evorl\xE4ufig / manuell zu pr\xFCfen\u201C gekennzeichnet. Bitte pr\xFCfen Sie die markierten Originaltextstellen vor Freigabe." : "Dieses Konformit\xE4tsdokument wurde regelbasiert auf Basis der verifizierten Angaben aus Sicherheitsdatenblatt, Technischem Merkblatt (TM) und Pr\xFCfberichten erstellt.",
        executiveSummary: `Das Produkt "${identifiedProductName}" (${identifiedManufacturer}) wurde gegen die spezifischen Kriterienzeilen von ${targetStandards.join(", ")} gepr\xFCft. Die detaillierten Einzelgutachten, Textbelege und K.O.-Begr\xFCndungen sind nachstehend aufgef\xFChrt.`,
        conclusion: `${conclusionPrefix}: ${targetStandards.map((c) => `${c} (${evaluations[c]?.overallRating})`).join(" \xB7 ")}`
      }
    };
    res.json({
      success: true,
      result
    });
  } catch (err) {
    console.error("Error analyzing product across standards:", err);
    res.status(500).json({
      success: false,
      message: sanitizeErrorMessage("Fehler bei der Multi-Standard-Analyse", err)
    });
  }
});
app.post("/api/dgnb/analyze-product", (_req, res) => {
  return res.redirect(307, "/api/standards/analyze-product");
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Process] Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[Process] Uncaught Exception:", error);
});
app.use((err, req, res, _next) => {
  console.error(`[Express Unhandled Error] ${req.method} ${req.originalUrl}:`, err);
  const isProd = process.env.NODE_ENV?.toLowerCase() === "production";
  if (err instanceof SyntaxError && "status" in err && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      code: "BAD_REQUEST",
      message: "Ung\xFCltiges JSON-Format im Anfrage-Body."
    });
  }
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      success: false,
      code: "PAYLOAD_TOO_LARGE",
      message: "Die \xFCbermittelte Datei \xFCberschreitet das zul\xE4ssige Gr\xF6\xDFenlimit."
    });
  }
  const statusCode = typeof err.status === "number" ? err.status : 500;
  const errorCode = err.code || (statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR");
  const message = isProd ? "Ein interner Serverfehler ist aufgetreten. Bitte versuchen Sie es sp\xE4ter erneut." : err?.message || "Interner Serverfehler";
  return res.status(statusCode).json({
    success: false,
    code: errorCode,
    message,
    ...isProd ? {} : { stack: err.stack }
  });
});
async function startServer() {
  const isDev = process.env.NODE_ENV?.toLowerCase() !== "production";
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }
  const server = isPipe ? app.listen(PORT, () => {
    console.log(`[QM-Tool Nachhaltigkeit Server] Running on pipe ${PORT} in ${isDev ? "development" : "production"} mode`);
  }) : app.listen(PORT, "0.0.0.0", () => {
    console.log(`[QM-Tool Nachhaltigkeit Server] Running at http://localhost:${PORT} in ${isDev ? "development" : "production"} mode`);
  });
  let isShuttingDown = false;
  const handleShutdown = (signal) => {
    if (isShuttingDown) {
      console.log(`[Server] ${signal} received again, forcing exit immediately.`);
      process.exit(1);
    }
    isShuttingDown = true;
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);
    server.close((err) => {
      if (err) {
        console.error("[Server] Error during server close:", err);
        process.exit(1);
      }
      console.log("[Server] All active HTTP requests finished. Process exiting cleanly.");
      process.exit(0);
    });
    const forceExitTimeout = setTimeout(() => {
      console.error("[Server] Graceful shutdown timeout exceeded (10s). Forcing termination.");
      process.exit(1);
    }, 1e4);
    forceExitTimeout.unref();
  };
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
}
if (process.env.VERCEL !== "1" && !process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.NODE_ENV?.toLowerCase() !== "test") {
  startServer();
}
var server_default = app;
export {
  ALLOWED_DOCUMENT_TYPES,
  MAX_PDF_BYTES,
  app,
  server_default as default,
  resolveDocumentType,
  sanitizeFilename,
  validateAndDecodePdf
};
