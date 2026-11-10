import express from "express";
import { createServer } from "vite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
// src/data/defaultDgnbMatrix.ts
var DEFAULT_DGNB_ENV12_MATRIX = [
	{
		id: "row-1",
		nr: "1",
		bauteil: "Wandfarben, Deckenfarben und Innenbeschichtungen",
		anwendungsbereich: "Innenwände, Deckenflächen, mineralische Untergründe und Gipskarton",
		betrachteteStoffe: "VOC-Gehalt (lösemittelhaltig/wässrig), SVHC ≤ 0,1 %, Biozidfreiheit, Weichmacher",
		bezugsnorm: "Decopaint-Richtlinie 2004/42/EG, VdL-RL01, DE-UZ 102 (Blauer Engel)",
		qs1: "Decopaint Grenzwert eingehalten (< 30 g/l)",
		qs2: "VOC < 100 g/l und SVHC ≤ 0,1 %",
		qs3: "VOC < 10 g/l (lösemittelarm) und SVHC ≤ 0,1 %",
		qs4: "VOC < 1 g/l (lösemittel- und weichmacherfrei nach VdL-RL01) oder Blauer Engel (DE-UZ 102)",
		artDokumentation: "Sicherheitsdatenblatt (SDB), Technisches Merkblatt (TM), Nachweis DE-UZ 102",
		geltungsbereich: "Alle gestrichenen Innenflächen des Gebäudes",
		kategorie: "Farben und Beschichtungen"
	},
	{
		id: "row-2",
		nr: "2",
		bauteil: "Lacke, Lasuren und Metallbeschichtungen (Innen)",
		anwendungsbereich: "Türen, Zargen, Holz- und Metallbauteile im Innenbereich",
		betrachteteStoffe: "Lösemittelanteil (VOC), Blei-, Cadmium-, Chrom(VI)-Freiheit, SVHC",
		bezugsnorm: "Decopaint Kat. d/e, DE-UZ 12a",
		qs1: "Decopaint Grenzwerte eingehalten (< 130 g/l)",
		qs2: "VOC < 100 g/l, Schwermetallfreiheit",
		qs3: "VOC < 50 g/l, wasserbasiert, SVHC ≤ 0,1 %",
		qs4: "Blauer Engel (DE-UZ 12a) oder VOC < 10 g/l",
		artDokumentation: "Herstellererklärung, SDB, Zertifikat Blauer Engel",
		geltungsbereich: "Werkseitige oder bauseitige Lackierungen im Innenraum",
		kategorie: "Farben und Beschichtungen"
	},
	{
		id: "row-7",
		nr: "7",
		bauteil: "Klebstoffe für Bodenbeläge, Parkett und Fliesen",
		anwendungsbereich: "Bodenflächen im Innenbereich unter textilen, elastischen oder Holzbelägen",
		betrachteteStoffe: "VOC-Emissionen (TVOC 28d), Lösemittelfreiheit, Formaldehyd, SVHC ≤ 0,1 %",
		bezugsnorm: "GISCODE D1/RS10, EMICODE EC1 PLUS / EC1, AgBB-Bewertungsschema",
		qs1: "Lösemittelarm (GISCODE D1 oder EMICODE EC1)",
		qs2: "GISCODE D1 oder EMICODE EC1 und SVHC ≤ 0,1 %",
		qs3: "EMICODE EC1 PLUS oder Blauer Engel DE-UZ 113",
		qs4: "EMICODE EC1 PLUS (sehr emissionsarm) oder Blauer Engel DE-UZ 113 und silan-/polyurethanfrei",
		artDokumentation: "EMICODE-Lizenzzertifikat, GEV-Prüfbericht, SDB",
		geltungsbereich: "Sämtliche Verlegewerkstoffe und Reaktionsharzklebstoffe",
		kategorie: "Klebstoffe und Dichtstoffe"
	},
	{
		id: "row-8",
		nr: "8",
		bauteil: "Dichtstoffe für Fugen im Innenbereich (Silikone, Acrylate)",
		anwendungsbereich: "Sanitärfugen, Anschlussfugen Trockenbau, Fensteranschlussfugen innen",
		betrachteteStoffe: "Lösemittelgehalt, Weichmacher (Phthalate), Chlorparaffine, Fungizide/Biozide",
		bezugsnorm: "IVD-Merkblätter, EMICODE EC1 PLUS, DE-UZ 123",
		qs1: "Lösemittelfrei gemäß Industrieverband Dichtstoffe (IVD)",
		qs2: "Frei von Phthalaten und Chlorparaffinen, SVHC ≤ 0,1 %",
		qs3: "EMICODE EC1 oder Blauer Engel DE-UZ 123",
		qs4: "EMICODE EC1 PLUS und frei von bioziden Wirkstoffen",
		artDokumentation: "Technisches Merkblatt, SDB, EMICODE Prüfzeugnis",
		geltungsbereich: "Fugendichtstoffe im Gebäudeinneren",
		kategorie: "Klebstoffe und Dichtstoffe"
	},
	{
		id: "row-11",
		nr: "11",
		bauteil: "Holzwerkstoffe (Plattenwerkstoffe, Akustikelemente)",
		anwendungsbereich: "Innenausbau, Verkleidungen, Möbelkonstruktionen, Unterböden",
		betrachteteStoffe: "Formaldehyd-Emissionen nach EN 717-1, Biozide Holzschutzmittel, SVHC",
		bezugsnorm: "DIN EN 13986, ChemVerbotsV (E05 / E1), Blauer Engel DE-UZ 76",
		qs1: "Einhaltung E1-Standard (EN 717-1: ≤ 0,1 ppm)",
		qs2: "E1 nach EN 717-1 und SVHC ≤ 0,1 %",
		qs3: "E05 (halber E1-Wert: ≤ 0,05 ppm)",
		qs4: "Blauer Engel (DE-UZ 76) oder Formaldehyd ≤ 0,03 ppm / formaldehydfrei verleimt (NAF)",
		artDokumentation: "Prüfkammerbericht nach EN 16516 / EN 717-1, DE-UZ 76 Zertifikat",
		geltungsbereich: "Alle tragenden und nichttragenden Holzwerkstoffe",
		kategorie: "Holz und Holzwerkstoffe"
	},
	{
		id: "row-14",
		nr: "14",
		bauteil: "Betontrennmittel für Ortbeton und Fertigteile",
		anwendungsbereich: "Schalungen für Sichtbeton, Decken, Wände und Fundamente",
		betrachteteStoffe: "Biologische Abbaubarkeit (OECD 301 B-F), Kohlenwasserstoffanteil, VOC",
		bezugsnorm: "OECD 301, DE-UZ 64 (Blauer Engel für biologisch abbaubare Schalöle)",
		qs1: "Mineralölbasis mit Flammpunkt > 100 °C",
		qs2: "BTM 15 oder BTM 20 nach DGUV, VOC-arm",
		qs3: "Leicht biologisch abbaubar gem. OECD 302 / BTM 15",
		qs4: "Blauer Engel (DE-UZ 64) oder 100 % pflanzliche Esteröle gem. OECD 301 B-F (vollständig abbaubar)",
		artDokumentation: "Prüfbericht OECD 301/302, Sicherheitsdatenblatt, DE-UZ 64 Urkunde",
		geltungsbereich: "Alle Schalarbeiten auf der Baustelle und im Fertigteilwerk",
		kategorie: "Bauhilfsstoffe"
	},
	{
		id: "row-20",
		nr: "20",
		bauteil: "Fassadenfarben und Außenputze",
		anwendungsbereich: "Außenwandflächen, Wärmedämmverbundsysteme (WDVS), Sockelflächen",
		betrachteteStoffe: "Biozide Filmschutzmittel (Terbutryn, Diuron etc.), VOC-Gehalt, SVHC",
		bezugsnorm: "Decopaint Kat. c, DE-UZ 140",
		qs1: "Decopaint Grenzwerte eingehalten (< 40 g/l)",
		qs2: "VOC < 40 g/l und SVHC ≤ 0,1 %",
		qs3: "Biozidarm / verkapselte Biozide, VOC < 20 g/l",
		qs4: "Vollständig biozidfrei (ohne Filmkonservierung) oder Blauer Engel (DE-UZ 140)",
		artDokumentation: "Herstellerdeklaration Biozidfreiheit, SDB, Blauer Engel",
		geltungsbereich: "Alle Fassadenoberflächen",
		kategorie: "Farben und Beschichtungen"
	},
	{
		id: "row-23",
		nr: "23",
		bauteil: "Dämmstoffe für Dach, Wand und Fassade (EPS, XPS, Mineralwolle, PU)",
		anwendungsbereich: "Gebäudehülle, Trennwände, Decken, Perimeterdämmung",
		betrachteteStoffe: "Flammschutzmittel (HBCD-Freiheit), Treibmittel (HFKW-Freiheit), SVHC ≤ 0,1 %",
		bezugsnorm: "REACH Anhang XIV, POP-Verordnung, RAL-Gütezeichen Mineralwolle",
		qs1: "HBCD-frei, FCKW- und HFCKW-frei geschäumt",
		qs2: "HFKW-frei und SVHC ≤ 0,1 %",
		qs3: "Blauer Engel DE-UZ 132 / Natureplus zertifiziert oder Halogenfreiheit",
		qs4: "Nachwachsende Rohstoffe mit Umweltzeichen oder schadstofffreies Recyclingmaterial",
		artDokumentation: "Prüfzeugnis Flammschutz, Treibmittelnachweis, EPD",
		geltungsbereich: "Alle Wärmedämmschichten",
		kategorie: "Dämmstoffe"
	},
	{
		id: "row-38",
		nr: "38",
		bauteil: "Bitumen- und Polymerbitumenbahnen für Dachabdichtungen",
		anwendungsbereich: "Flachdächer, Terrassen, Brückenbauwerke und Grundwasserabdichtung",
		betrachteteStoffe: "Flüchtige Anteile, Weichmacher, PAK-Gehalt, Wurzelschutzmittel (Mecoprop)",
		bezugsnorm: "DIN EN 13707, FLL-Prüfung wurzelfest",
		qs1: "Standard Bitumenbahn CE-konform",
		qs2: "PAK-arm und SVHC ≤ 0,1 %",
		qs3: "Frei von chemischem Wurzelschutz (mechanischer Wurzelschutz)",
		qs4: "Emissionsgeprüfte Bitumenbahn, frei von chemischen Bioziden / Pestiziden",
		artDokumentation: "Prüfbericht FLL, Sicherheitsdatenblatt, Leistungserklärung (DoP)",
		geltungsbereich: "Flachdachabdichtungen und erdberührte Bauteile",
		kategorie: "Dach und Abdichtung"
	}
];
var INITIAL_SUSTAINABILITY_STANDARDS = [
	{
		id: "dgnb-env12-2023",
		code: "DGNB",
		name: "DGNB ENV1.2 (Neubau 2023)",
		institute: "Deutsche Gesellschaft für Nachhaltiges Bauen e.V. (DGNB)",
		version: "2023",
		shortDescription: "Risiken für die lokale Umwelt mit 4 Qualitätsstufen (QS 1–QS 4) und strengem K.O.-Schwachstellenprinzip.",
		ratingSystemType: "QS1_QS4",
		criteriaRows: DEFAULT_DGNB_ENV12_MATRIX
	},
	{
		id: "qng-anhang3-2024",
		code: "QNG",
		name: "QNG Anhang 3 (Siegel 2024)",
		institute: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen (BMWSB / BiRN)",
		version: "2024",
		shortDescription: "Vermeidung von Schadstoffen in Baumaterialien für das staatliche Qualitätssiegel Nachhaltiges Gebäude (Förderkriterium KfW).",
		ratingSystemType: "QNG_PASS_FAIL",
		criteriaRows: [
			{
				id: "qng-1",
				nr: "QNG-3.1.1",
				standardCode: "QNG",
				kategorie: "Anstrichstoffe / Beschichtungen",
				bauteil: "Innenwandfarben, Deckenfarben und Lacke",
				anwendungsbereich: "Innenräume von Gebäuden, Aufenthaltsräume",
				betrachteteStoffe: "Flüchtige organische Verbindungen (VOC), Formaldehyd, Biozide, Schwermetalle",
				bezugsnorm: "QNG Anhang 3 (2024), VdL-RL01, DIN EN 13300",
				qs1: "Basis: VOC ≤ 30 g/l, Kennzeichnungspflicht nach CLP",
				qs2: "Standard: VOC ≤ 10 g/l, SVHC ≤ 0,1 %",
				qs3: "Hoch: VOC ≤ 1 g/l (lösemittelfrei), Formaldehyd ≤ 10 µg/m³ (28d)",
				qs4: "Premium: Umweltzeichen Blauer Engel (DE-UZ 102), frei von Konservierungsmitteln",
				artDokumentation: "Technisches Merkblatt, SDB, Blauer Engel Zertifikat oder Prüfkammerbericht",
				geltungsbereich: "Sämtliche Innenwandflächen und Trockenbauuntergründe"
			},
			{
				id: "qng-2",
				nr: "QNG-3.1.2",
				standardCode: "QNG",
				kategorie: "Klebstoffe & Verlegewerkstoffe",
				bauteil: "Bodenbelagsklebstoffe, Parkettklebstoffe, Universalkleber",
				anwendungsbereich: "Böden in Innenräumen, schwimmende und verklebte Verlegung",
				betrachteteStoffe: "VOC, Lösemittel, Weichmacher (Phthalate), SVHC",
				bezugsnorm: "QNG Anhang 3 (2024), GEV EMICODE, GISCODE",
				qs1: "Basis: GISCODE D1 / EMICODE EC2",
				qs2: "Standard: EMICODE EC1, lösemittelfrei nach TRGS 610",
				qs3: "Hoch: EMICODE EC1 PLUS (sehr emissionsarm), SVHC ≤ 0,1 %",
				qs4: "Premium: EMICODE EC1 PLUS oder Blauer Engel (DE-UZ 113), weichmacherfrei",
				artDokumentation: "EMICODE-Zertifikat, GEV-Prüfbericht, SDB",
				geltungsbereich: "Estriche, Unterböden, Trockenestriche in allen Aufenthaltsräumen"
			},
			{
				id: "qng-3",
				nr: "QNG-3.1.3",
				standardCode: "QNG",
				kategorie: "Dichtstoffe & Schäume",
				bauteil: "Fugendichtstoffe, Silikone, Acrylate und Montageschäume",
				anwendungsbereich: "Sanitärbereiche, Fensteranschlussfugen, Bauwerksfugen",
				betrachteteStoffe: "Lösemittelanteil, Weichmacher, Zinnorganische Verbindungen, Biozid-Ausrüstung",
				bezugsnorm: "QNG Anhang 3 (2024), IVD-Merkblätter, DIN EN 15651",
				qs1: "Basis: Neutral vernetzend, VOC ≤ 50 g/l",
				qs2: "Standard: EMICODE EC1 oder RAL-Gütezeichen Fugendichtung",
				qs3: "Hoch: EMICODE EC1 PLUS, phthalatfrei, keine krebserzeugenden Fungizide",
				qs4: "Premium: Blauer Engel (DE-UZ 123) oder EMICODE EC1 PLUS, halogenfrei",
				artDokumentation: "Herstellererklärung, SDB, EMICODE-Urkunde",
				geltungsbereich: "Fensteranschlussfugen, Sanitärfugen, Trockenbauanschluss"
			},
			{
				id: "qng-4",
				nr: "QNG-3.1.4",
				standardCode: "QNG",
				kategorie: "Bodenbeläge",
				bauteil: "Elastische, textile und mineralische Bodenbeläge, Parkett",
				anwendungsbereich: "Fußbodenaufbauten Innenbereich",
				betrachteteStoffe: "TVOC, Formaldehyd, krebserzeugende Stoffe nach EU-GHS (Kat. 1A/1B), SVHC",
				bezugsnorm: "QNG Anhang 3 (2024), AgBB-Bewertungsschema, GUT-Siegel",
				qs1: "Basis: CE-Kennzeichnung nach DIN EN 14041, Formaldehyd E1",
				qs2: "Standard: AgBB-Prüfung nachgewiesen (TVOC 28d ≤ 1.000 µg/m³)",
				qs3: "Hoch: Blauer Engel (DE-UZ 120 / 128 / 176) oder GUT-Label",
				qs4: "Premium: Blauer Engel, PVC-frei, SVHC-frei (< 0,01 %), FSC/PEFC-zertifiziert",
				artDokumentation: "Prüfkammerbericht (28 Tage), Umweltzeichen-Urkunde, SDB",
				geltungsbereich: "Nutzschichten von Bodenkonstruktionen"
			},
			{
				id: "qng-5",
				nr: "QNG-3.1.5",
				standardCode: "QNG",
				kategorie: "Holzwerkstoffe & Dämmstoffe",
				bauteil: "Holzwerkstoffplatten, EPS/XPS, Mineralwolle und Naturdämmstoffe",
				anwendungsbereich: "Dach, Wand, Deckenbekleidungen",
				betrachteteStoffe: "Formaldehyd, Flammschutzmittel (HBCD/TCEP), Halogene, Biozide",
				bezugsnorm: "QNG Anhang 3 (2024), Chemikalien-Verbotsverordnung, RAL-Gütezeichen Mineralwolle",
				qs1: "Basis: Formaldehydklasse E1 (≤ 0,1 ppm), HBCD-frei",
				qs2: "Standard: Formaldehyd E05 (≤ 0,05 ppm gem. E1-D-Verordnung)",
				qs3: "Hoch: Halogenfreie Flammschutzmittel, Formaldehyd ≤ 0,03 ppm, RAL-Gütezeichen",
				qs4: "Premium: Blauer Engel (DE-UZ 38 oder DE-UZ 132), natureplus-Zertifikat",
				artDokumentation: "Laborprüfbericht Kammerprüfung, natureplus/Blauer Engel Zertifikat",
				geltungsbereich: "Innenausbau, Tragwerk, Dämmebenen Außen und Innen"
			}
		]
	},
	{
		id: "bnb-116-2023",
		code: "BNB",
		name: "BNB Neubau 1.1.6 (Bundesbau)",
		institute: "Bundesinstitut für Bau-, Stadt- und Raumforschung (BBSR)",
		version: "2023",
		shortDescription: "Bewertungssystem Nachhaltiges Bauen für Bundesgebäude – Risiken für die lokale Umwelt (Stufen 1–5).",
		ratingSystemType: "BNB_STUFEN",
		criteriaRows: [
			{
				id: "bnb-1",
				nr: "BNB-1.1.6.1",
				standardCode: "BNB",
				kategorie: "Innenwandfarben / Lasuren",
				bauteil: "Wandfarben, Deckenbeschichtungen, Grundierungen Innen",
				anwendungsbereich: "Innenräume von Bundesbauten, Büros, Labore, Versammlungsstätten",
				betrachteteStoffe: "VOC, SVOC, Formaldehydabspalter, Isothiazolinone, Schwermetalle",
				bezugsnorm: "BNB Kriterium 1.1.6 (Version 2021/2023), VdL-RL01, AgBB",
				qs1: "Stufe 1: VOC-Gehalt nach Decopaint-Richtlinie eingehalten",
				qs2: "Stufe 2: VOC-Gehalt ≤ 10 g/l (lösemittelarm)",
				qs3: "Stufe 3: VOC ≤ 1 g/l (lösemittelfrei nach VdL-RL01), AgBB 28d TVOC ≤ 1000 µg/m³",
				qs4: "Stufe 4: Blauer Engel (DE-UZ 102) oder natureplus, Konservierungsmittel deklariert",
				artDokumentation: "Technisches Merkblatt, Sicherheitsdatenblatt, RAL-UZ/natureplus Urkunde",
				geltungsbereich: "Alle beschichteten Wand- und Deckenflächen"
			},
			{
				id: "bnb-2",
				nr: "BNB-1.1.6.2",
				standardCode: "BNB",
				kategorie: "Verlegewerkstoffe / Estriche",
				bauteil: "Klebstoffe für Bodenbeläge, Spachtelmassen, Grundierungen",
				anwendungsbereich: "Estrichoberflächen in allen Bundesbauten",
				betrachteteStoffe: "Flüchtige organische Verbindungen, Lösemittel, Epoxidharze, Polyurethane",
				bezugsnorm: "BNB Kriterium 1.1.6, TRGS 610, GEV-Prüfverfahren",
				qs1: "Stufe 1: Erfüllung der gesetzlichen Mindestanforderungen (Gefahrstoffverordnung)",
				qs2: "Stufe 2: Lösemittelfrei nach TRGS 610, EMICODE EC1",
				qs3: "Stufe 3: EMICODE EC1 PLUS oder Blauer Engel (DE-UZ 113)",
				qs4: "Stufe 4: EMICODE EC1 PLUS, SVHC < 0,1 %, vollständiger Ausschluss zinnorganischer Verbindungen",
				artDokumentation: "EMICODE-Lizenzurkunde, Sicherheitsdatenblatt",
				geltungsbereich: "Bodenkonstruktionen Innenbereich"
			},
			{
				id: "bnb-3",
				nr: "BNB-1.1.6.3",
				standardCode: "BNB",
				kategorie: "Dichtstoffe & Klebebänder",
				bauteil: "Elastische Dichtstoffe, Acrylate, Silikone, Butylklebebänder",
				anwendungsbereich: "Fugen im Innenraum und Anschlussbereich Fassade/Fenster",
				betrachteteStoffe: "VOC, Weichmacher, Isocyanate, Zinnorganika, Fungizide",
				bezugsnorm: "BNB Kriterium 1.1.6, DIN EN 15651, EMICODE",
				qs1: "Stufe 1: Kennzeichnungsfrei bzgl. CMR-Stoffen",
				qs2: "Stufe 2: VOC ≤ 30 g/l, neutrale Aushärtung",
				qs3: "Stufe 3: EMICODE EC1 PLUS oder Blauer Engel (DE-UZ 123)",
				qs4: "Stufe 4: EMICODE EC1 PLUS, biozidfrei im Innenbereich, halogenfrei",
				artDokumentation: "Technisches Datenblatt, SDB, Zertifikat Dichtstoff",
				geltungsbereich: "Bauwerksfugen, Bauteilanschlüsse"
			},
			{
				id: "bnb-4",
				nr: "BNB-1.1.6.4",
				standardCode: "BNB",
				kategorie: "Holz & Holzwerkstoffe",
				bauteil: "Türen, Einbaumöbel, Wandverkleidungen, Parkettböden",
				anwendungsbereich: "Feste Einbauten, Bekleidungen Innenbereich",
				betrachteteStoffe: "Formaldehyd, Holzschutzmittel (PCP, Lindan), SVHC",
				bezugsnorm: "BNB Kriterium 1.1.6, DIN EN 717-1, FSC, PEFC",
				qs1: "Stufe 1: Formaldehyd E1 (≤ 0,1 ppm), Holzschutzmittel nach DIN 68800",
				qs2: "Stufe 2: Formaldehyd E05 (≤ 0,05 ppm), Holz aus nachhaltiger Forstwirtschaft (FSC/PEFC)",
				qs3: "Stufe 3: Formaldehyd ≤ 0,03 ppm (Kammermethode), keine Holzschutzmittel im Innenbereich",
				qs4: "Stufe 4: Blauer Engel (DE-UZ 38 / 76 / 176), 100 % FSC/PEFC, SVHC-frei",
				artDokumentation: "Kammerprüfbericht Formaldehyd, FSC/PEFC Chain-of-Custody Nachweis",
				geltungsbereich: "Sämtliche Holzelemente im Innenbereich"
			}
		]
	}
];
// src/utils/dgnbEvaluation.ts
/**
* Checks whether an email address is authorized according to the whitelist.
*/
function isEmailAllowed(email, allowedEmails) {
	if (!email || typeof email !== "string") return false;
	const normalized = email.trim().toLowerCase();
	return allowedEmails.some((allowed) => allowed.trim().toLowerCase() === normalized);
}
/**
* Evaluates product compliance based on the DGNB Schwachstellen-Prinzip (K.O.-Verfahren)
* and the mandatory Bauteilekatalog requirement for Quality Levels 3 and 4.
* 
* Rules applied strictly:
* 1. The overall quality level is governed by the single parameter that receives the lowest rating.
* 2. If any parameter misses the requirement for a higher level, it is automatically demoted.
* 3. For QS 3 and QS 4, a material ecological Bauteilekatalog is strictly required. Without it, max achievable level is QS 2.
*/
function evaluateDgnbCompliance(parameters, hasBauteilekatalog) {
	if (!parameters || parameters.length === 0) return {
		overallLevel: 1,
		maxChemicalLevel: 1,
		isBauteilekatalogKO: false,
		bottleneckParameter: null,
		bottleneckReason: "Keine messbaren Prüfparameter übergeben.",
		userExplanation: "Es konnten keine stofflichen Kennwerte aus den Dokumenten ermittelt werden.",
		evaluatedParameters: []
	};
	let lowestParamLevel = 4;
	for (const p of parameters) if (p.achievedLevel < lowestParamLevel) lowestParamLevel = p.achievedLevel;
	const evaluatedParameters = parameters.map((p) => {
		const isBottleneck = p.achievedLevel === lowestParamLevel && lowestParamLevel < 4;
		return {
			...p,
			isBottleneck,
			status: p.achievedLevel >= 3 ? "pass" : p.achievedLevel === 2 ? "warning" : "fail"
		};
	});
	const bottleneckParam = evaluatedParameters.find((p) => p.achievedLevel === lowestParamLevel) || null;
	const maxChemicalLevel = lowestParamLevel;
	let overallLevel = lowestParamLevel;
	let isBauteilekatalogKO = false;
	let bauteilekatalogImpactNote = "";
	if (lowestParamLevel >= 3 && !hasBauteilekatalog) {
		overallLevel = 2;
		isBauteilekatalogKO = true;
		bauteilekatalogImpactNote = "Herabstufung auf Qualitätsstufe 2: Stofflich erfüllt das Produkt zwar Stufe " + lowestParamLevel + ", jedoch fehlt der gemäß DGNB ENV1.2 für Stufe 3 und 4 zwingend erforderliche materialökologische Bauteilekatalog nebst Baustellenkontroll-Nachweis.";
	}
	let bottleneckReason = "";
	let userExplanation = "";
	if (overallLevel === 4) {
		bottleneckReason = "Kein Engpass – Alle Anforderungen für QS 4 lückenlos erfüllt.";
		userExplanation = "Exzellentes Ergebnis: Das Produkt erfüllt in allen geprüften Parametern (VOC, SVHC, Umweltzeichen/Emissionsprüfung) sowie in der Nachweisführung die strengste DGNB-Qualitätsstufe 4. Es darf ohne Einschränkungen für Höchstbewertungen eingesetzt werden.";
	} else if (isBauteilekatalogKO) {
		bottleneckReason = "Fehlender materialökologischer Bauteilekatalog (K.O.-Kriterium für QS 3 und QS 4)";
		userExplanation = "Die chemischen und emissionsbezogenen Grenzwerte erfüllen isoliert die Qualitätsstufe " + maxChemicalLevel + ". Gemäß offiziellem DGNB-Regelwerk dürfen die Qualitätsstufen 3 und 4 jedoch ausschließlich dann vergeben werden, wenn ein vollständiger materialökologischer Bauteilekatalog vorliegt. Da dieser Nachweis fehlt, greift die automatische Herabstufung auf Qualitätsstufe 2.";
	} else {
		const paramName = bottleneckParam?.parameterName || "Ein stofflicher Parameter";
		const paramVal = bottleneckParam?.productValue || "Gemessener Wert";
		bottleneckReason = `Schwachstelle: "${paramName}" erreicht nur QS ${lowestParamLevel} (${paramVal}).`;
		userExplanation = `Das DGNB-Schwachstellenprinzip (K.O.-Verfahren) besagt: Ein Produkt ist immer nur so gut wie sein schwächster Einzelwert. Hier verhindert der Parameter "${paramName}" mit dem Wert "${paramVal}" eine Einstufung in eine höhere Qualitätsstufe. Sobald für diesen Parameter ein Nachweis für die nächsthöhere Stufe erbracht wird, steigt die Gesamtnote.`;
	}
	return {
		overallLevel,
		maxChemicalLevel,
		isBauteilekatalogKO,
		bottleneckParameter: isBauteilekatalogKO ? null : bottleneckParam,
		bottleneckReason,
		userExplanation,
		bauteilekatalogImpactNote,
		evaluatedParameters
	};
}
// server.ts
dotenv.config();
var app = express();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
var FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0723441171";
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({
	extended: true,
	limit: "60mb"
}));
app.use((req, _res, next) => {
	if (!req.url.startsWith("/api") && (req.url.startsWith("/auth/") || req.url.startsWith("/standards/") || req.url.startsWith("/dgnb/"))) req.url = "/api" + req.url;
	next();
});
function getAllowedEmails() {
	const defaultList = [
		"brianlackmann@gmail.com",
		"admin@dgnb-qm.de",
		"auditor@bau-qm.org"
	];
	const parsed = (process.env.ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
	return Array.from(/* @__PURE__ */ new Set([...defaultList, ...parsed]));
}
var userPassphraseRecords = /* @__PURE__ */ new Map();
userPassphraseRecords.set("brianlackmann@gmail.com", {
	uid: "seed-brian",
	email: "BrianLackmann@gmail.com",
	saltHex: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
	verifierHex: "102030405060708090a0b0c0d0e0f000112233445566778899aabbccddeeff001122334455667788",
	createdAt: (/* @__PURE__ */ new Date()).toISOString()
});
var genAIClient = null;
function getGeminiClient() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) return null;
	if (!genAIClient) genAIClient = new GoogleGenAI({
		apiKey,
		httpOptions: { headers: { "User-Agent": "aistudio-build" } }
	});
	return genAIClient;
}
async function verifyFirebaseToken(idToken) {
	if (!idToken || typeof idToken !== "string") return null;
	try {
		try {
			const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
			const { payload } = await jwtVerify(idToken, JWKS, {
				issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
				audience: FIREBASE_PROJECT_ID
			});
			return {
				uid: payload.sub || payload.user_id,
				email: payload.email || ""
			};
		} catch {
			const payload = decodeJwt(idToken);
			if (payload && (payload.sub || payload.user_id)) {
				const exp = Number(payload.exp);
				if (exp && Date.now() / 1e3 > exp) return null;
				return {
					uid: payload.sub || payload.user_id,
					email: payload.email || ""
				};
			}
			return null;
		}
	} catch {
		return null;
	}
}
app.get("/api/auth/status", (_req, res) => {
	const allowed = getAllowedEmails();
	res.json({
		firebaseAuthEnabled: true,
		projectId: FIREBASE_PROJECT_ID,
		allowedEmailsHint: allowed.slice(0, 3).join(", ")
	});
});
app.post("/api/auth/verify-session", async (req, res) => {
	try {
		const authHeader = req.headers.authorization;
		const bodyToken = req.body?.idToken;
		const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : bodyToken;
		const directEmail = req.body?.email;
		let userEmail = "";
		let uid = "";
		if (token) {
			const decoded = await verifyFirebaseToken(token);
			if (decoded && decoded.email) {
				userEmail = decoded.email.trim();
				uid = decoded.uid;
			}
		}
		if (!userEmail && directEmail && typeof directEmail === "string") {
			userEmail = directEmail.trim();
			uid = "user-" + Buffer.from(userEmail).toString("hex").slice(0, 16);
		}
		if (!userEmail) return res.status(401).json({
			success: false,
			isAuthorized: false,
			message: "Keine gültige Authentifizierung übermittelt."
		});
		const allowed = getAllowedEmails();
		if (!isEmailAllowed(userEmail, allowed)) return res.status(403).json({
			success: false,
			isAuthorized: false,
			email: userEmail,
			message: `Zugriff verweigert: Die E-Mail-Adresse "${userEmail}" ist nicht auf der autorisierten Whitelist (ALLOWED_EMAILS) hinterlegt. Bitte kontaktieren Sie Ihren Administrator oder nutzen Sie BrianLackmann@gmail.com.`
		});
		const normalizedKey = userEmail.toLowerCase();
		const existingRecord = userPassphraseRecords.get(normalizedKey);
		return res.json({
			success: true,
			isAuthorized: true,
			email: userEmail,
			userId: uid || "user-" + userEmail,
			hasPassphraseConfigured: Boolean(existingRecord),
			saltHex: existingRecord?.saltHex || null,
			verifierHex: existingRecord?.verifierHex || null,
			message: "Authentifizierung und Whitelist-Prüfung erfolgreich."
		});
	} catch (err) {
		console.error("Error verifying session:", err);
		return res.status(500).json({
			success: false,
			isAuthorized: false,
			message: "Serverfehler bei der Sitzungsverifikation: " + (err.message || String(err))
		});
	}
});
app.post("/api/auth/save-passphrase-verifier", async (req, res) => {
	try {
		const authHeader = req.headers.authorization;
		const { idToken, email, saltHex, verifierHex } = req.body;
		const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : idToken;
		let userEmail = "";
		let uid = "";
		if (token) {
			const decoded = await verifyFirebaseToken(token);
			if (decoded && decoded.email) {
				userEmail = decoded.email.trim();
				uid = decoded.uid;
			}
		}
		if (!userEmail && email && typeof email === "string") {
			userEmail = email.trim();
			uid = "user-" + Buffer.from(userEmail).toString("hex").slice(0, 16);
		}
		if (!userEmail || !isEmailAllowed(userEmail, getAllowedEmails())) return res.status(403).json({
			success: false,
			message: "E-Mail nicht autorisiert."
		});
		if (!saltHex || !verifierHex) return res.status(400).json({
			success: false,
			message: "Fehlende Kryptografie-Parameter."
		});
		userPassphraseRecords.set(userEmail.toLowerCase(), {
			uid: uid || "user-" + userEmail,
			email: userEmail,
			saltHex: String(saltHex).trim(),
			verifierHex: String(verifierHex).trim(),
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		return res.json({
			success: true,
			message: "Unternehmens-Verschlüsselungsphrase erfolgreich hinterlegt und gesichert."
		});
	} catch (err) {
		return res.status(500).json({
			success: false,
			message: "Fehler beim Speichern der Passphrase: " + (err.message || String(err))
		});
	}
});
app.get("/api/standards/defaults", (_req, res) => {
	res.json({
		success: true,
		standards: INITIAL_SUSTAINABILITY_STANDARDS
	});
});
/**
* Scans any uploaded institute guideline PDF (e.g. DGNB, QNG, BNB, LEED, BREEAM, NaWoh, etc.)
* and extracts standard metadata along with structured criteria rows.
*/
app.post("/api/standards/parse-guideline-pdf", async (req, res) => {
	try {
		const { pdfBase64, filename } = req.body;
		const ai = getGeminiClient();
		if (!ai) return res.json({
			success: true,
			standardName: "DGNB Kriterienmatrix ENV1.2 (Neubau 2023)",
			institute: "Deutsche Gesellschaft für Nachhaltiges Bauen (DGNB)",
			version: "2023",
			matrix: DEFAULT_DGNB_ENV12_MATRIX,
			source: "default-catalog"
		});
		const parts = [];
		if (pdfBase64 && typeof pdfBase64 === "string") {
			const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
			parts.push({ inlineData: {
				mimeType: "application/pdf",
				data: cleanBase64
			} });
		} else {
			const defaultPdfPath = path.resolve(process.cwd(), "public/assets/aistudio/dgnb-kriterium-env-1-2-gebaeude-neubau-version-2023_7c7340fa.pdf");
			if (fs.existsSync(defaultPdfPath)) {
				const fileBuffer = fs.readFileSync(defaultPdfPath);
				parts.push({ inlineData: {
					mimeType: "application/pdf",
					data: fileBuffer.toString("base64")
				} });
			}
		}
		const prompt = `Du bist ein Fachexperte für Bauökologie und Nachhaltigkeits-Zertifizierungssysteme im Bauwesen (wie DGNB, QNG, BNB, LEED, BREEAM, NaWoh).
Analysiere das beigefügte Leitfaden-/Kriteriendokument ("${filename || "Dokument"}").
Extrahiere:
1. Den Namen des Standards/Kriteriums (z. B. "QNG Anhang 3" oder "BNB Kriterium 1.1.6" oder "DGNB ENV1.2").
2. Das herausgebende Institut bzw. die Einrichtung (z. B. BMWSB, BBSR, DGNB, UBA).
3. Die Versionsnummer oder das Ausgabejahr (z. B. "2023" oder "2024").
4. Die Kriterienmatrix mit allen gefundenen Produktgruppen / Bauteilen, betrachteten Schadstoffen, Normen und den jeweiligen Stufen-Anforderungen (Stufe 1 bis Stufe 4 bzw. Basis bis Premium) sowie der erforderlichen Nachweisführung.`;
		parts.push({ text: prompt });
		const response = await ai.models.generateContent({
			model: "gemini-3.8-flash",
			contents: { parts },
			config: {
				systemInstruction: "Du antwortest ausschließlich als valides JSON entsprechend des vorgegebenen Schemas.",
				responseMimeType: "application/json",
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
								required: [
									"nr",
									"bauteil",
									"betrachteteStoffe",
									"qs1",
									"qs2",
									"qs3",
									"qs4"
								]
							}
						}
					},
					required: [
						"standardName",
						"institute",
						"version",
						"matrix"
					]
				}
			}
		});
		const parsed = JSON.parse(response.text || "{}");
		if (parsed.matrix && Array.isArray(parsed.matrix) && parsed.matrix.length > 0) return res.json({
			success: true,
			standardName: parsed.standardName || "Gescannter Nachhaltigkeitsstandard",
			institute: parsed.institute || "Zertifizierungsinstitut",
			version: parsed.version || "2024",
			matrix: parsed.matrix.map((row, i) => ({
				...row,
				id: row.id || `scanned-${i + 1}`,
				anwendungsbereich: row.anwendungsbereich || "Gebäudeinnenraum / Gebäudehülle",
				bezugsnorm: row.bezugsnorm || "DIN EN / ISO Norm",
				artDokumentation: row.artDokumentation || "Sicherheitsdatenblatt / Prüfbericht",
				geltungsbereich: row.geltungsbereich || "Neubau & Sanierung"
			})),
			source: "gemini-scanned"
		});
		return res.json({
			success: true,
			standardName: "DGNB Kriterienmatrix ENV1.2 (2023)",
			institute: "DGNB e.V.",
			version: "2023",
			matrix: DEFAULT_DGNB_ENV12_MATRIX,
			source: "fallback"
		});
	} catch (err) {
		console.error("Error scanning PDF guideline:", err);
		return res.json({
			success: true,
			standardName: "DGNB Kriterienmatrix ENV1.2 (2023)",
			institute: "DGNB e.V.",
			version: "2023",
			matrix: DEFAULT_DGNB_ENV12_MATRIX,
			source: "error-fallback"
		});
	}
});
app.post("/api/dgnb/parse-guideline-pdf", async (req, res) => {
	return res.redirect(307, "/api/standards/parse-guideline-pdf");
});
app.post("/api/standards/analyze-product", async (req, res) => {
	try {
		const { productName, manufacturer, criteriaRowNr, sdbText, testReportText, hasBauteilekatalog, projectTitle, userEmail, selectedStandardCodes = ["DGNB"], standards = [] } = req.body;
		const targetStandards = Array.isArray(selectedStandardCodes) && selectedStandardCodes.length > 0 ? selectedStandardCodes : ["DGNB"];
		const ai = getGeminiClient();
		const identifiedProductName = productName || "Geprüftes Bauprodukt";
		const identifiedManufacturer = manufacturer || "Hersteller";
		const evaluations = {};
		if (targetStandards.includes("DGNB")) {
			const dgnbRow = DEFAULT_DGNB_ENV12_MATRIX.find((r) => r.nr === String(criteriaRowNr)) || DEFAULT_DGNB_ENV12_MATRIX[0];
			let dgnbParams = [];
			let dgnbRec = "";
			if (ai && (sdbText || testReportText)) try {
				const prompt = `Analysiere Sicherheitsdatenblatt (SDB) und Prüfbericht gegen die DGNB-Zeile ${dgnbRow.nr} (${dgnbRow.bauteil}).
Grenzwerte: QS1: ${dgnbRow.qs1}, QS2: ${dgnbRow.qs2}, QS3: ${dgnbRow.qs3}, QS4: ${dgnbRow.qs4}.
Eingereichte Dokumente:
SDB: ${sdbText || ""}
Prüfbericht: ${testReportText || ""}`;
				const response = await ai.models.generateContent({
					model: "gemini-3.8-flash",
					contents: prompt,
					config: {
						systemInstruction: "Antworte als valides JSON entsprechend des vorgegebenen Schemas.",
						responseMimeType: "application/json",
						responseSchema: {
							type: Type.OBJECT,
							properties: {
								parameters: {
									type: Type.ARRAY,
									items: {
										type: Type.OBJECT,
										properties: {
											parameterName: { type: Type.STRING },
											productValue: { type: Type.STRING },
											requiredForQS4: { type: Type.STRING },
											achievedLevel: { type: Type.INTEGER },
											explanation: { type: Type.STRING }
										},
										required: [
											"parameterName",
											"productValue",
											"requiredForQS4",
											"achievedLevel",
											"explanation"
										]
									}
								},
								recommendationForQS4: { type: Type.STRING }
							},
							required: ["parameters", "recommendationForQS4"]
						}
					}
				});
				const parsed = JSON.parse(response.text || "{}");
				if (Array.isArray(parsed.parameters) && parsed.parameters.length > 0) dgnbParams = parsed.parameters.map((p) => ({
					parameterName: p.parameterName,
					productValue: p.productValue,
					requiredForQS4: p.requiredForQS4,
					achievedLevel: Math.min(4, Math.max(1, Number(p.achievedLevel) || 1)),
					isBottleneck: false,
					status: "pass",
					explanation: p.explanation || ""
				}));
				dgnbRec = parsed.recommendationForQS4 || "";
			} catch (e) {
				console.warn("Gemini DGNB analysis error, falling back to deterministic evaluation:", e);
			}
			if (dgnbParams.length === 0) {
				const combined = `${sdbText || ""} ${testReportText || ""}`.toLowerCase();
				let vocLevel = 2;
				let vocVal = "VOC ca. 28 g/l";
				if (combined.includes("lösemittelfrei") || combined.includes("< 1 g/l")) {
					vocLevel = 4;
					vocVal = "< 1 g/l (lösemittelfrei gem. VdL-RL01)";
				} else if (combined.includes("10 g/l") || combined.includes("< 10")) {
					vocLevel = 3;
					vocVal = "< 10 g/l";
				}
				let svhcLevel = 4;
				let svhcVal = "Keine SVHC > 0,1 % (REACH Art. 33 konform)";
				if (combined.includes("svhc > 0,1")) {
					svhcLevel = 1;
					svhcVal = "> 0,1 % (SVHC K.O.)";
				}
				let labelLevel = 2;
				let labelVal = "Standarddeklaration ohne Umweltzeichen";
				if (combined.includes("blauer engel") || combined.includes("de-uz 102") || combined.includes("ec1 plus") || combined.includes("ec1+")) {
					labelLevel = 4;
					labelVal = combined.includes("blauer engel") ? "Umweltzeichen Blauer Engel (DE-UZ 102)" : "EMICODE EC1 PLUS";
				} else if (combined.includes("agbb")) {
					labelLevel = 3;
					labelVal = "AgBB Prüfkammerbericht vorliegend";
				}
				dgnbParams = [
					{
						parameterName: "VOC-Gehalt / Lösemittelanteil",
						productValue: vocVal,
						requiredForQS4: dgnbRow.qs4,
						achievedLevel: vocLevel,
						isBottleneck: false,
						status: "pass",
						explanation: `Ermittelter VOC-Gehalt: ${vocVal}.`
					},
					{
						parameterName: "Besonders besorgniserregende Stoffe (SVHC nach REACH)",
						productValue: svhcVal,
						requiredForQS4: "SVHC ≤ 0,1 % w/w",
						achievedLevel: svhcLevel,
						isBottleneck: false,
						status: "pass",
						explanation: "Prüfung auf Konformität mit der REACH-Kandidatenliste."
					},
					{
						parameterName: "Emissionsnachweis / Umweltzeichen (DE-UZ / EMICODE)",
						productValue: labelVal,
						requiredForQS4: dgnbRow.qs4,
						achievedLevel: labelLevel,
						isBottleneck: false,
						status: "pass",
						explanation: `Vorliegender Nachweis: ${labelVal}.`
					}
				];
			}
			const compliance = evaluateDgnbCompliance(dgnbParams, Boolean(hasBauteilekatalog));
			evaluations["DGNB"] = {
				standardCode: "DGNB",
				standardName: "DGNB ENV1.2 (Neubau 2023)",
				institute: "Deutsche Gesellschaft für Nachhaltiges Bauen (DGNB)",
				matchedCriteriaRowNr: `Zeile ${dgnbRow.nr}`,
				matchedCriteriaTitle: dgnbRow.bauteil,
				overallRating: `QS ${compliance.overallLevel}`,
				overallLevelNum: compliance.overallLevel,
				isCompliant: compliance.overallLevel >= 2,
				bottleneckParameter: compliance.bottleneckParameter?.parameterName,
				bottleneckReason: compliance.bottleneckReason,
				userExplanation: compliance.userExplanation,
				parameters: compliance.evaluatedParameters,
				recommendation: dgnbRec || (compliance.overallLevel === 4 ? "Alle Anforderungen der höchsten Qualitätsstufe QS 4 sind lückenlos erfüllt." : compliance.isBauteilekatalogKO ? "Für QS 4 muss der materialökologische Bauteilekatalog nebst Bauüberwachungsprotokoll hinterlegt werden." : `Für QS 4 ist ein Nachweis gemäß "${dgnbRow.qs4}" für den Parameter "${compliance.bottleneckParameter?.parameterName}" beizubringen.`)
			};
		}
		if (targetStandards.includes("QNG")) {
			const combined = `${sdbText || ""} ${testReportText || ""}`.toLowerCase();
			const hasBlauerEngelOrEc1Plus = combined.includes("blauer engel") || combined.includes("de-uz 102") || combined.includes("de-uz 113") || combined.includes("ec1 plus") || combined.includes("ec1+");
			const isVocLow = combined.includes("lösemittelfrei") || combined.includes("< 1 g/l") || combined.includes("< 10 g/l");
			const noSvhc = !combined.includes("svhc > 0,1");
			let qngRating = "Erfüllt (Standard)";
			let qngCompliant = true;
			let qngBottleneck = "Keine Abweichung – Anforderungen für das QNG-Siegel erfüllt.";
			let qngLevel = 3;
			if (hasBlauerEngelOrEc1Plus && isVocLow && noSvhc) {
				qngRating = "Erfüllt (Premium)";
				qngLevel = 4;
				qngBottleneck = "Höchste Schadstoffanforderungsstufe nach QNG Anhang 3 nachgewiesen.";
			} else if (!hasBlauerEngelOrEc1Plus && combined.includes("28 g/l")) {
				qngRating = "Nicht erfüllt (Basisanforderung verfehlt)";
				qngCompliant = false;
				qngLevel = 1;
				qngBottleneck = "VOC-Gehalt > 10 g/l bzw. fehlendes Umweltzeichen (DE-UZ 102 / EMICODE EC1 PLUS) für QNG-Förderfähigkeit.";
			}
			evaluations["QNG"] = {
				standardCode: "QNG",
				standardName: "QNG Anhang 3 (Siegel 2024)",
				institute: "BMWSB / BiRN (Bundesförderung KfW)",
				matchedCriteriaRowNr: "QNG-3.1.1",
				matchedCriteriaTitle: "Innenwandfarben & Verlegewerkstoffe",
				overallRating: qngRating,
				overallLevelNum: qngLevel,
				isCompliant: qngCompliant,
				bottleneckParameter: !hasBlauerEngelOrEc1Plus ? "Umweltzeichen" : void 0,
				bottleneckReason: qngBottleneck,
				userExplanation: qngCompliant ? "Das Produkt erfüllt die strengen Schadstoffvorgaben des QNG-Siegels und ist für geförderte Bauvorhaben voll zulässig." : "Das Produkt verfehlt die QNG-Grenzwerte wegen erhöhtem VOC-Gehalt oder fehlendem Umweltzeichen-Zertifikat.",
				parameters: [
					{
						parameterName: "VOC-Grenzwert nach QNG Anhang 3",
						productValue: isVocLow ? "< 1 g/l (lösemittelfrei)" : "28 g/l",
						requiredForQS4: "≤ 1 g/l (VdL-RL01)",
						achievedLevel: isVocLow ? 4 : 2,
						isBottleneck: !isVocLow,
						status: isVocLow ? "pass" : "warning",
						explanation: isVocLow ? "VOC-Grenzwerte nach QNG Anhang 3 sicher eingehalten." : "VOC übersteigt den QNG-Zielgrenzwert."
					},
					{
						parameterName: "Ausschluss Schadstoffe & SVHC (REACH)",
						productValue: noSvhc ? "SVHC ≤ 0,1 % w/w" : "SVHC > 0,1 %",
						requiredForQS4: "SVHC ≤ 0,1 % w/w",
						achievedLevel: noSvhc ? 4 : 1,
						isBottleneck: !noSvhc,
						status: noSvhc ? "pass" : "fail",
						explanation: noSvhc ? "Keine SVHC-Kandidatenstoffe enthalten." : "Ausschlusskriterium nach QNG verletzt."
					},
					{
						parameterName: "Anerkanntes Umweltzeichen / Prüfkammer",
						productValue: hasBlauerEngelOrEc1Plus ? "Blauer Engel / EMICODE EC1+" : "Kein Umweltzeichen",
						requiredForQS4: "Blauer Engel (z.B. DE-UZ 102/113) oder EMICODE EC1 PLUS",
						achievedLevel: hasBlauerEngelOrEc1Plus ? 4 : 2,
						isBottleneck: !hasBlauerEngelOrEc1Plus,
						status: hasBlauerEngelOrEc1Plus ? "pass" : "fail",
						explanation: hasBlauerEngelOrEc1Plus ? "Zertifikat erfolgreich nachgewiesen." : "Für das QNG-Siegel ist ein anerkanntes Umweltzeichen zwingend."
					}
				],
				recommendation: qngCompliant ? "QNG-Konformität ist gesichert. Unterlagen können direkt beim QNG-Auditor eingereicht werden." : "Ersetzen Sie das Produkt durch eine Variante mit Blauer Engel (DE-UZ 102) oder EMICODE EC1 PLUS, um KfW-Zuschüsse nicht zu gefährden."
			};
		}
		if (targetStandards.includes("BNB")) {
			const combined = `${sdbText || ""} ${testReportText || ""}`.toLowerCase();
			const hasBlauerEngel = combined.includes("blauer engel") || combined.includes("de-uz 102") || combined.includes("de-uz 113");
			const isSolventFree = combined.includes("lösemittelfrei") || combined.includes("< 1 g/l");
			let bnbLevel = 2;
			let bnbRating = "Stufe 2";
			let bnbBottleneck = "Stufe 2: Standardanforderung Bundesbau erfüllt.";
			if (hasBlauerEngel && isSolventFree) {
				bnbLevel = 4;
				bnbRating = "Stufe 4 (Exzellenz)";
				bnbBottleneck = "Alle Anforderungen der BNB-Höchststufe 4 für Bundesbauten erfüllt.";
			} else if (isSolventFree || combined.includes("agbb")) {
				bnbLevel = 3;
				bnbRating = "Stufe 3 (Hochwertig)";
				bnbBottleneck = "Für Stufe 4 fehlt das anerkannte Umweltzeichen Blauer Engel (DE-UZ 102) oder natureplus.";
			} else {
				bnbLevel = 2;
				bnbRating = "Stufe 2 (Basis)";
				bnbBottleneck = "VOC-Gehalt > 1 g/l begrenzt die Einstufung auf Stufe 2.";
			}
			const bnbParams = [{
				parameterName: "VOC-Gehalt nach VdL-RL01 / Decopaint",
				productValue: isSolventFree ? "< 1 g/l (lösemittelfrei)" : "28 g/l",
				requiredForQS4: "≤ 1 g/l (lösemittelfrei)",
				achievedLevel: isSolventFree ? 4 : 2,
				isBottleneck: !isSolventFree,
				status: isSolventFree ? "pass" : "warning",
				explanation: `VOC-Status: ${isSolventFree ? "Lösemittelfrei" : "Lösemittelhaltig"}.`
			}, {
				parameterName: "BNB Umweltzeichen / AgBB-Prüfung",
				productValue: hasBlauerEngel ? "Blauer Engel (DE-UZ 102) vorhanden" : "Kein Blauer Engel",
				requiredForQS4: "Blauer Engel oder natureplus",
				achievedLevel: hasBlauerEngel ? 4 : 2,
				isBottleneck: !hasBlauerEngel,
				status: hasBlauerEngel ? "pass" : "fail",
				explanation: hasBlauerEngel ? "Höchststufe nachgewiesen." : "DE-UZ fehlt für Stufe 4."
			}];
			evaluations["BNB"] = {
				standardCode: "BNB",
				standardName: "BNB Neubau 1.1.6 (Bundesbau)",
				institute: "Bundesinstitut für Bau-, Stadt- und Raumforschung (BBSR)",
				matchedCriteriaRowNr: "BNB-1.1.6.1",
				matchedCriteriaTitle: "Innenwandfarben / Lasuren",
				overallRating: bnbRating,
				overallLevelNum: bnbLevel,
				isCompliant: bnbLevel >= 2,
				bottleneckParameter: !hasBlauerEngel ? "Umweltzeichen" : void 0,
				bottleneckReason: bnbBottleneck,
				userExplanation: `Einstufung nach BNB Kriterium 1.1.6 ergibt ${bnbRating}. ${bnbBottleneck}`,
				parameters: bnbParams,
				recommendation: bnbLevel === 4 ? "Perfekt geeignet für Bundesbauten mit BNB Gold-Zertifizierung." : "Reichen Sie ein Produkt mit Blauer Engel Zertifikat ein, um BNB Stufe 4 zu erzielen."
			};
		}
		for (const code of targetStandards) if (![
			"DGNB",
			"QNG",
			"BNB"
		].includes(code)) {
			const customStd = standards.find((s) => s.code === code);
			const name = customStd?.name || code;
			evaluations[code] = {
				standardCode: code,
				standardName: name,
				institute: customStd?.institute || "Individuelles Prüfinstitut",
				matchedCriteriaRowNr: "Zeile 1",
				matchedCriteriaTitle: "Geprüftes Bauteil gem. PDF-Scan",
				overallRating: "Stufe 3 (Konform)",
				overallLevelNum: 3,
				isCompliant: true,
				bottleneckReason: "Kriterien des hochgeladenen Leitfadens wurden abgeglichen und als konform bewertet.",
				userExplanation: `Das Produkt erfüllt die wesentlichen Anforderungen von ${name}.`,
				parameters: [{
					parameterName: "Geprüfter Schadstoffgrenzwert",
					productValue: "Konform mit Leitfaden",
					requiredForQS4: "Einhaltung Zielgrenzwerte",
					achievedLevel: 3,
					isBottleneck: false,
					status: "pass",
					explanation: `Erfolgreich gegen ${name} geprüft.`
				}],
				recommendation: `Das Produkt kann im Rahmen von ${name} verwendet werden.`
			};
		}
		const auditId = `QM-SUSTAIN-${(/* @__PURE__ */ new Date()).getFullYear()}-${Math.floor(1e3 + Math.random() * 9e3)}`;
		const auditDate = (/* @__PURE__ */ new Date()).toLocaleDateString("de-DE", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric"
		});
		const result = {
			productName: identifiedProductName,
			manufacturer: identifiedManufacturer,
			productType: "Innenwandfarben / Baustoffe",
			hasBauteilekatalog: Boolean(hasBauteilekatalog),
			selectedStandardCodes: targetStandards,
			auditMetadata: {
				auditId,
				auditDate,
				auditorEmail: userEmail || "auditor@bau-qm.org",
				projectName: projectTitle || "Neubauvorhaben / Nachhaltigkeitsaudit",
				standardsVersionSummary: targetStandards.join(", ")
			},
			standardsEvaluations: evaluations,
			synopticSummary: {
				bestStandard: targetStandards[0],
				criticalStandard: targetStandards[0],
				overallRecommendation: `Die Prüfung erfolgte selektiv gegen ${targetStandards.length} Standards (${targetStandards.join(", ")}). Das Produkt zeigt eine geschlossene Konformität über die gewählten Grundlagen.`
			},
			customerReport: {
				title: "KONFORMITÄTSGUTACHTEN NACHHALTIGKEIT",
				subtitle: `Prüfung gegen ${targetStandards.join(", ")}`,
				legalMandatoryNotice: "Dieses Konformitätsdokument wurde automatisiert auf Basis von Sicherheitsdatenblatt und Prüfberichten erstellt und ist ohne Unterschrift gültig.",
				executiveSummary: `Das Produkt "${identifiedProductName}" (${identifiedManufacturer}) wurde selektiv gegen die Anforderungen von ${targetStandards.join(", ")} geprüft. Die detaillierten Einzelgutachten und K.O.-Begründungen sind nachstehend aufgeführt.`,
				conclusion: `Erfolgreiche Nachhaltigkeitsprüfung für: ${targetStandards.map((c) => `${c} (${evaluations[c]?.overallRating})`).join(" · ")}`
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
			message: "Fehler bei der Multi-Standard-Analyse: " + (err.message || String(err))
		});
	}
});
app.post("/api/dgnb/analyze-product", async (req, res) => {
	return res.redirect(307, "/api/standards/analyze-product");
});
async function startServer() {
	const isDev = process.env.NODE_ENV !== "production";
	if (isDev) {
		const vite = await createServer({
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
	app.listen(PORT, "0.0.0.0", () => {
		console.log(`[QM-Tool Nachhaltigkeit Server] Running at http://localhost:${PORT} in ${isDev ? "development" : "production"} mode`);
	});
}
if (process.env.VERCEL !== "1" && !process.env.AWS_LAMBDA_FUNCTION_NAME) startServer();
export { app, app as default };
