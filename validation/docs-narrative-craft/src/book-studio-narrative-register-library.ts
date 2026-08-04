import type {
  BookNarrativeGenreId,
  BookNarrativeRegisterDimensionId,
  BookNarrativeScenarioId,
  BookNarrativeSceneFunctionId,
} from "./book-studio-narrative-register-types";

export const BOOK_NARRATIVE_REGISTER_DIMENSION_IDS: readonly BookNarrativeRegisterDimensionId[] = Object.freeze([
  "pace", "suspense", "mystery", "dread", "romantic_charge", "wonder", "humour", "violence_intensity",
  "world_texture", "procedural_detail", "interiority", "lyricism", "moral_ambiguity", "revelation_density",
  "action_density", "social_pressure", "sensory_density", "accessibility",
]);

export interface BookNarrativeRegisterBlueprint {
  values: Partial<Record<BookNarrativeRegisterDimensionId, number>>;
  promiseRules: string[];
  failureSignals: string[];
  productionDirections: string[];
  counterweights: string[];
}

export interface BookNarrativeRegisterOverlay {
  values: Partial<Record<BookNarrativeRegisterDimensionId, number>>;
  productionDirections: string[];
  counterweights: string[];
}

function genre(
  values: BookNarrativeRegisterBlueprint["values"],
  promiseRules: string[],
  failureSignals: string[],
  productionDirections: string[],
  counterweights: string[],
): BookNarrativeRegisterBlueprint {
  return { values, promiseRules, failureSignals, productionDirections, counterweights };
}

function overlay(
  values: BookNarrativeRegisterOverlay["values"],
  productionDirections: string[],
  counterweights: string[],
): BookNarrativeRegisterOverlay {
  return { values, productionDirections, counterweights };
}

export const BOOK_NARRATIVE_GENRE_BLUEPRINTS: Readonly<Record<BookNarrativeGenreId, BookNarrativeRegisterBlueprint>> = Object.freeze({
  literary: genre(
    { interiority: 0.8, lyricism: 0.45, moral_ambiguity: 0.75, social_pressure: 0.5, action_density: -0.25, procedural_detail: -0.15 },
    ["Consequences remain psychologically and socially specific.", "Theme emerges from choice, image and contradiction rather than summary."],
    ["Ambiguity substitutes for causality.", "Beautiful sentences detach from character pressure or material circumstance."],
    ["Let form, image and withheld judgement deepen a concrete human problem.", "Permit unresolved feeling while keeping events and choices exact."],
    ["Do not equate slowness with seriousness.", "Do not flatten genre momentum merely to sound literary."],
  ),
  historical: genre(
    { world_texture: 0.85, procedural_detail: 0.65, social_pressure: 0.7, sensory_density: 0.55, moral_ambiguity: 0.45, accessibility: 0.05 },
    ["Material culture, institutions and social constraints alter what characters can do.", "Historical knowledge enters through lived consequence rather than lecture."],
    ["Modern assumptions are projected without pressure from the period.", "Research appears as inert inventory or dialogue exposition."],
    ["Use period-specific labour, law, transport, hierarchy and risk as causal machinery.", "Distinguish documented fact, plausible inference and deliberate invention."],
    ["Do not make every period detail conspicuous.", "Do not sacrifice clarity to decorative archaism."],
  ),
  mystery: genre(
    { mystery: 0.95, revelation_density: 0.65, suspense: 0.5, procedural_detail: 0.55, moral_ambiguity: 0.35, action_density: -0.1 },
    ["Clues are visible before their meaning is understood.", "Solutions revise earlier scenes without making them fraudulent."],
    ["The answer depends on unplanted information.", "The investigator withholds active reasoning solely to deceive the reader."],
    ["Build competing causal models and let evidence change their probabilities.", "Make each discovery alter tactics, trust or exposure."],
    ["Do not mistake obscurity for difficulty.", "Do not solve the case through confession alone."],
  ),
  thriller: genre(
    { pace: 0.8, suspense: 0.9, action_density: 0.65, revelation_density: 0.55, procedural_detail: 0.35, interiority: -0.15 },
    ["Threat narrows time, options or safe relationships.", "Every major answer increases cost, exposure or moral compromise."],
    ["Escalation only enlarges explosions or body counts.", "Characters escape through unexplained luck or antagonist delay."],
    ["Use deadlines, pursuit, information asymmetry and irreversible commitments.", "Keep spatial and causal sequencing unusually clear during pressure."],
    ["Do not let speed erase emotional aftermath.", "Do not turn every scene into the same level of urgency."],
  ),
  crime_noir: genre(
    { mystery: 0.55, moral_ambiguity: 0.9, social_pressure: 0.7, dread: 0.35, lyricism: 0.15, humour: 0.1, romantic_charge: 0.1 },
    ["Institutions and incentives make clean choices costly.", "Voice sharpens moral perception without becoming ornamental cynicism."],
    ["Cynicism replaces character motive.", "Women, outsiders or victims exist only as atmosphere or temptation."],
    ["Track debt, leverage, compromised loyalty and who profits from the apparent crime.", "Let wit function as defence, status play or misdirection."],
    ["Do not copy stock hard-boiled phrasing.", "Do not confuse bleakness with inevitability."],
  ),
  horror: genre(
    { dread: 0.95, suspense: 0.75, sensory_density: 0.65, mystery: 0.45, violence_intensity: 0.4, interiority: 0.35, humour: -0.4 },
    ["Fear attaches to a rule, violation, vulnerability or loss the reader can understand.", "The frightening force changes relationships and choices before spectacle peaks."],
    ["Every detail is ominous from the first line.", "Graphic intensity substitutes for anticipation, implication or consequence."],
    ["Escalate from credible disturbance through pattern recognition to costly knowledge.", "Use ordinary routines and trusted places as pressure-bearing structures."],
    ["Do not overexplain the source of fear.", "Do not protect characters from the emotional cost of survival."],
  ),
  gothic: genre(
    { dread: 0.75, mystery: 0.7, lyricism: 0.6, world_texture: 0.65, interiority: 0.65, romantic_charge: 0.3, moral_ambiguity: 0.55 },
    ["Place, inheritance, repression and memory exert active pressure.", "Beauty and threat remain entangled rather than merely alternating."],
    ["Architecture is decorative scenery.", "Secrets exist only to delay a conventional answer."],
    ["Make rooms, weather, objects and family rituals store contested history.", "Let desire distort perception without invalidating every observation."],
    ["Do not rely on purple description alone.", "Do not turn every character into the same haunted temperament."],
  ),
  dark_fantasy: genre(
    { world_texture: 0.8, dread: 0.65, wonder: 0.55, violence_intensity: 0.55, moral_ambiguity: 0.75, action_density: 0.35 },
    ["Power has legible cost, history and social consequence.", "Moral darkness arises from systems and choices, not constant cruelty."],
    ["Lore replaces present action.", "Bleakness becomes an aesthetic with no human counterforce."],
    ["Bind the fantastic to appetite, obligation, body, landscape and political power.", "Keep moments of tenderness, humour or beauty available as meaningful contrast."],
    ["Do not copy familiar grimdark mannerisms.", "Do not make every institution equally corrupt."],
  ),
  epic_fantasy: genre(
    { world_texture: 0.95, wonder: 0.8, action_density: 0.55, social_pressure: 0.55, moral_ambiguity: 0.4, interiority: 0.25, accessibility: 0.1 },
    ["Large-scale events emerge from intimate motives, logistics and institutions.", "Magic, geography and political structure constrain action consistently."],
    ["Scale is delivered through summary rather than decisive lived scenes.", "Secondary characters collapse into faction labels or lore messengers."],
    ["Track travel, communication, supply, command, kinship and competing interpretations of history.", "Use wonder to change understanding or choice, not merely decorate discovery."],
    ["Do not front-load encyclopaedic exposition.", "Do not make prophecy replace agency."],
  ),
  science_fiction: genre(
    { wonder: 0.75, procedural_detail: 0.65, world_texture: 0.7, moral_ambiguity: 0.6, revelation_density: 0.45, interiority: 0.2 },
    ["Speculative conditions alter daily life, institutions, identity and consequence.", "Explanations remain proportional to what a character needs or risks."],
    ["A concept is described but never changes behaviour.", "Technical vocabulary masks causal vagueness."],
    ["Ask what the technology or condition makes cheap, scarce, visible, governable or intimate.", "Use discovery to revise both the world model and the character's moral problem."],
    ["Do not stop the story for a lecture.", "Do not make every specialist equally articulate to outsiders."],
  ),
  space_opera: genre(
    { wonder: 0.9, action_density: 0.7, pace: 0.55, world_texture: 0.75, social_pressure: 0.45, romantic_charge: 0.2, accessibility: 0.35 },
    ["Spectacle remains spatially clear and emotionally attached to a person, crew or polity.", "Distinct societies produce different incentives rather than cosmetic variation."],
    ["Technology solves whichever obstacle the scene presents.", "Planetary scale erases local material detail."],
    ["Combine strategic scale with cockpit, corridor, household or diplomatic consequence.", "Let loyalties and resource constraints shape every heroic choice."],
    ["Do not use constant banter to avoid grief or awe.", "Do not make every culture share one contemporary voice."],
  ),
  romance: genre(
    { romantic_charge: 0.95, interiority: 0.75, social_pressure: 0.55, humour: 0.25, sensory_density: 0.45, violence_intensity: -0.45 },
    ["Attraction grows through specific attention, changed interpretation and chosen vulnerability.", "The central relationship develops through reciprocal agency and meaningful obstacles."],
    ["Chemistry is asserted through appearance alone.", "Miscommunication persists without motive, cost or character history."],
    ["Track what each person notices, risks, misreads, offers and learns to ask for.", "Let intimacy alter self-concept, priorities and future behaviour."],
    ["Do not erase external plot or social life.", "Do not treat jealousy, coercion or contempt as universal proof of passion."],
  ),
  adventure: genre(
    { pace: 0.65, action_density: 0.75, wonder: 0.6, world_texture: 0.55, suspense: 0.45, accessibility: 0.55 },
    ["Movement reveals new constraints, cultures, skills and consequences.", "Set pieces require planning, trade-offs and aftermath."],
    ["Travel becomes a montage without changed relationships.", "Danger resolves through generic competence or coincidence."],
    ["Use terrain, weather, equipment, fatigue and local knowledge as active problems.", "Vary awe, danger, ingenuity, humour and recovery."],
    ["Do not repeat the same obstacle at greater scale.", "Do not let spectacle detach from the expedition's human purpose."],
  ),
  war: genre(
    { violence_intensity: 0.75, social_pressure: 0.8, procedural_detail: 0.65, action_density: 0.55, moral_ambiguity: 0.8, interiority: 0.35 },
    ["Orders, logistics, training, terrain and imperfect information shape outcomes.", "Violence produces durable bodily, moral and relational consequence."],
    ["Combatants behave as interchangeable units.", "Tactical clarity is achieved by granting impossible awareness."],
    ["Model command friction, fear regulation, group loyalty, civilian pressure and incomplete reports.", "Let competence coexist with error, luck and institutional failure."],
    ["Do not romanticise suffering by deleting aftermath.", "Do not make every soldier cynical or eloquent in the same way."],
  ),
  western: genre(
    { world_texture: 0.65, social_pressure: 0.55, moral_ambiguity: 0.65, action_density: 0.4, lyricism: 0.2, procedural_detail: 0.35 },
    ["Land, labour, distance, law and community reputation constrain choice.", "Violence changes the social field rather than restoring a simple moral order."],
    ["Landscape is a postcard.", "Indigenous people or settlers become undifferentiated backdrop."],
    ["Use water, animals, transport, property, jurisdiction and witness as causal facts.", "Let silence and reputation carry different meanings across relationships."],
    ["Do not reproduce stock frontier mythology uncritically.", "Do not make stoicism identical to emotional absence."],
  ),
  magical_realism: genre(
    { wonder: 0.65, lyricism: 0.7, interiority: 0.45, world_texture: 0.55, moral_ambiguity: 0.55, mystery: 0.25 },
    ["The extraordinary belongs to a coherent cultural and emotional reality.", "Metaphoric resonance does not erase material consequence."],
    ["Magic appears as whimsical decoration.", "Narration explains which events are real instead of sustaining the work's ontology."],
    ["Treat impossible events with selective normality while preserving their social effects.", "Let image, memory and history create multiple valid scales of meaning."],
    ["Do not borrow culturally specific traditions as generic atmosphere.", "Do not use ambiguity to avoid causal responsibility."],
  ),
  satire_comedy: genre(
    { humour: 0.95, social_pressure: 0.65, pace: 0.35, moral_ambiguity: 0.35, accessibility: 0.45, dread: -0.4 },
    ["Humour reveals incentive, hypocrisy, status or self-deception.", "Comic escalation follows character logic and accumulates consequence."],
    ["Jokes can be transferred unchanged to another cast.", "Every character becomes equally witty and self-aware."],
    ["Build comic engines from incompatible goals, rules, audiences and mistaken models.", "Vary timing through setup, delay, reversal, callback, understatement and material action."],
    ["Do not sacrifice character truth for a line.", "Do not mistake references or snark for comic structure."],
  ),
  young_adult: genre(
    { accessibility: 0.8, pace: 0.45, interiority: 0.65, social_pressure: 0.7, romantic_charge: 0.35, revelation_density: 0.35 },
    ["Identity, belonging and autonomy emerge through difficult choices rather than labels.", "Young characters possess specific competence, contradiction and social intelligence."],
    ["Adults are uniformly foolish or absent for convenience.", "Emotion is simplified because the audience is young."],
    ["Use immediacy, peer interpretation, family pressure and first consequential freedoms.", "Keep prose accessible while allowing moral and emotional complexity."],
    ["Do not imitate contemporary slang mechanically.", "Do not make every conflict a misunderstanding."],
  ),
  middle_grade: genre(
    { accessibility: 0.95, wonder: 0.65, pace: 0.55, humour: 0.35, dread: 0.15, violence_intensity: -0.45, interiority: 0.35 },
    ["Problems are understandable, consequential and solvable through growth, cooperation or ingenuity.", "Fear and grief are honest without dwelling on adult-level graphic detail."],
    ["The story lectures the reader.", "Children succeed only because adults become implausibly incompetent."],
    ["Use concrete goals, discoverable rules, strong scene questions and active friendships.", "Let humour and wonder coexist with real loss, embarrassment and responsibility."],
    ["Do not flatten vocabulary into baby talk.", "Do not reset emotional consequences after each adventure."],
  ),
  childrens: genre(
    { accessibility: 1, wonder: 0.8, humour: 0.55, pace: 0.45, violence_intensity: -0.85, moral_ambiguity: -0.3, sensory_density: 0.35 },
    ["Language, repetition and image support comprehension and anticipation.", "The central emotional problem is concrete and resolves through an observable change."],
    ["A moral is stated instead of dramatised.", "Repetition adds words without pattern, participation or payoff."],
    ["Use patterned escalation, precise verbs, memorable objects and read-aloud rhythm.", "Give the child character genuine agency within an age-appropriate world."],
    ["Do not confuse simplicity with vagueness.", "Do not use fear, shame or punishment as the only engines."],
  ),
});

export const BOOK_NARRATIVE_SCENE_FUNCTION_OVERLAYS: Readonly<Record<BookNarrativeSceneFunctionId, BookNarrativeRegisterOverlay>> = Object.freeze({
  opening_image: overlay({ mystery: 0.2, sensory_density: 0.25, pace: -0.15 }, ["Establish a specific normal, pressure and image that can change meaning later."], ["Do not explain the whole premise before the reader has a lived foothold."]),
  setup: overlay({ world_texture: 0.2, social_pressure: 0.15, action_density: -0.15 }, ["Plant routines, obligations and vulnerabilities through active tasks."], ["Do not turn setup into neutral biography or inventory."]),
  inciting_disruption: overlay({ pace: 0.25, suspense: 0.2, revelation_density: 0.2 }, ["Break an existing equilibrium and make non-response costly."], ["Do not rely on scale alone; change the character's available future."]),
  commitment: overlay({ social_pressure: 0.25, moral_ambiguity: 0.15, action_density: 0.1 }, ["Force a choice that closes easier alternatives."], ["Do not confuse verbal intention with irreversible commitment."]),
  investigation: overlay({ mystery: 0.35, procedural_detail: 0.3, revelation_density: 0.15 }, ["Let method, error and interpretation compete."], ["Do not make clue acquisition a checklist."]),
  discovery: overlay({ revelation_density: 0.4, wonder: 0.15, suspense: 0.1 }, ["Make new knowledge revise a goal, relationship or causal model."], ["Do not deliver information without downstream action."]),
  negotiation: overlay({ social_pressure: 0.4, suspense: 0.15, action_density: -0.2 }, ["Track offers, withheld information, face and changing outside options."], ["Do not make both sides state their true limits."]),
  intimacy: overlay({ interiority: 0.35, romantic_charge: 0.25, sensory_density: 0.15, pace: -0.25 }, ["Build intimacy through specific attention, permission and risk."], ["Do not replace vulnerability with generic physical description."]),
  temptation: overlay({ romantic_charge: 0.15, moral_ambiguity: 0.3, suspense: 0.1 }, ["Make the desired action solve a real problem while creating a deeper cost."], ["Do not make temptation obviously foolish from the beginning."]),
  betrayal: overlay({ social_pressure: 0.35, revelation_density: 0.25, interiority: 0.2 }, ["Bind betrayal to prior trust, rationalisation and changed access."], ["Do not treat shock as the complete emotional consequence."]),
  reversal: overlay({ revelation_density: 0.25, pace: 0.2, suspense: 0.2 }, ["Reverse leverage or interpretation using previously available causes."], ["Do not use arbitrary new information."]),
  revelation: overlay({ revelation_density: 0.5, mystery: 0.15, pace: 0.05 }, ["Pay off planted evidence and alter future decisions."], ["Do not make revelation merely explanatory."]),
  confrontation: overlay({ social_pressure: 0.35, suspense: 0.25, action_density: 0.15 }, ["Force incompatible goals into the same space and make avoidance impossible."], ["Do not let accusation replace tactical interaction."]),
  action_set_piece: overlay({ action_density: 0.45, pace: 0.35, sensory_density: 0.2 }, ["Organise action around changing objectives, geography and cost."], ["Do not render motion as an undifferentiated sequence of impacts."]),
  battle: overlay({ action_density: 0.5, violence_intensity: 0.3, procedural_detail: 0.2 }, ["Preserve command, terrain, limited perception and consequence."], ["Do not grant participants a complete overhead view."]),
  chase: overlay({ pace: 0.5, action_density: 0.35, suspense: 0.3 }, ["Change route, pursuer advantage and escape options through specific obstacles."], ["Do not repeat running or driving beats without tactical change."]),
  escape: overlay({ suspense: 0.4, pace: 0.35, action_density: 0.25 }, ["Make escape require sacrifice, deception or an irreversible exposure."], ["Do not make the final barrier easier than the earlier ones."]),
  journey: overlay({ world_texture: 0.25, wonder: 0.15, pace: -0.05 }, ["Use movement to alter knowledge, relationship, capability or obligation."], ["Do not summarise away every consequential encounter."]),
  aftermath: overlay({ interiority: 0.3, social_pressure: 0.2, pace: -0.35 }, ["Show changed bodies, resources, trust, story and future choices."], ["Do not reset characters once immediate danger ends."]),
  grief: overlay({ interiority: 0.45, pace: -0.4, lyricism: 0.1 }, ["Represent grief through attention, routine, avoidance, memory and social mismatch."], ["Do not force one recognisable stage sequence onto every character."]),
  decision: overlay({ interiority: 0.25, moral_ambiguity: 0.25, suspense: 0.15 }, ["Make alternatives concrete and let the choice close a valued future."], ["Do not substitute internal debate for decision pressure."]),
  climax: overlay({ action_density: 0.3, suspense: 0.45, revelation_density: 0.25, social_pressure: 0.25 }, ["Bring the central value conflict into an irreversible choice and consequence."], ["Do not solve the climax through a late external rescue."]),
  denouement: overlay({ pace: -0.35, interiority: 0.2, social_pressure: 0.15 }, ["Show the new pattern of life, relationship and unresolved cost."], ["Do not explain every theme or future outcome."]),
  epilogue: overlay({ pace: -0.3, lyricism: 0.15, revelation_density: 0.1 }, ["Provide resonance, consequence or a deliberate changed frame."], ["Do not repeat the ending in summary form."]),
});

export const BOOK_NARRATIVE_SCENARIO_OVERLAYS: Readonly<Record<BookNarrativeScenarioId, BookNarrativeRegisterOverlay>> = Object.freeze({
  interrogation: overlay({ social_pressure: 0.4, mystery: 0.25, suspense: 0.25, procedural_detail: 0.15 }, ["Track what each answer commits, conceals or reveals about the questioner."], ["Do not make pressure equal constant shouting."]),
  council_or_court: overlay({ social_pressure: 0.45, procedural_detail: 0.25, moral_ambiguity: 0.2 }, ["Use audience, rules, precedent, coalition and record as active forces."], ["Do not let every speaker deliver a position statement."]),
  domestic_conflict: overlay({ interiority: 0.25, social_pressure: 0.35, action_density: -0.2 }, ["Let ordinary objects, routines and old repairs carry contested meaning."], ["Do not make intimacy produce perfect mutual understanding."]),
  first_meeting: overlay({ mystery: 0.15, social_pressure: 0.2, romantic_charge: 0.1 }, ["Build first impressions from selective attention, need and misreading."], ["Do not summarise instant chemistry or distrust without evidence."]),
  reunion: overlay({ interiority: 0.25, social_pressure: 0.25, revelation_density: 0.1 }, ["Let remembered and present versions of each person conflict."], ["Do not make elapsed history disappear after one greeting."]),
  farewell: overlay({ interiority: 0.3, social_pressure: 0.15, pace: -0.25 }, ["Use what cannot be said, delayed tasks and future uncertainty."], ["Do not rely on generic finality or tears alone."]),
  confession: overlay({ interiority: 0.35, social_pressure: 0.35, revelation_density: 0.25 }, ["Make disclosure selective, self-serving, risky and incomplete in character-specific ways."], ["Do not treat confession as automatic absolution or perfect truth."]),
  seduction: overlay({ romantic_charge: 0.45, social_pressure: 0.2, mystery: 0.1 }, ["Track consent, attention, performance, motive and changing interpretation."], ["Do not confuse coercion or generic attractiveness with reciprocal charge."]),
  argument: overlay({ social_pressure: 0.4, pace: 0.15, interiority: 0.1 }, ["Change tactic, topic, audience and face risk as the argument develops."], ["Do not produce symmetrical speeches or instant articulation of the real issue."]),
  bargain: overlay({ social_pressure: 0.35, moral_ambiguity: 0.25, suspense: 0.15 }, ["Track reservation values, hidden costs, enforceability and future leverage."], ["Do not make the cleverest line decide the whole bargain."]),
  heist: overlay({ procedural_detail: 0.4, suspense: 0.35, action_density: 0.3, pace: 0.2 }, ["Bind plan stages to roles, dependencies, contingencies and betrayal incentives."], ["Do not make the plan fail only because of arbitrary bad luck."]),
  infiltration: overlay({ suspense: 0.45, procedural_detail: 0.25, mystery: 0.15 }, ["Use identity performance, observation, access and escalating verification."], ["Do not make guards oblivious without institutional reason."]),
  ritual: overlay({ world_texture: 0.4, sensory_density: 0.3, social_pressure: 0.2, wonder: 0.2 }, ["Let sequence, material, witness and taboo encode real stakes."], ["Do not present ritual as an exotic list with no participant meaning."]),
  trial: overlay({ procedural_detail: 0.35, social_pressure: 0.4, mystery: 0.15 }, ["Use admissibility, burden, audience and institutional incentive as conflict."], ["Do not make one speech override all evidence and procedure."]),
  survival: overlay({ procedural_detail: 0.3, suspense: 0.4, sensory_density: 0.25, action_density: 0.25 }, ["Track body, weather, tools, time, knowledge and group trust."], ["Do not make hardship a repetitive endurance montage."]),
  travel: overlay({ world_texture: 0.25, sensory_density: 0.15, pace: -0.05 }, ["Make transit consume time, resources and attention while exposing social difference."], ["Do not use travel only to bridge locations."]),
  siege: overlay({ suspense: 0.4, procedural_detail: 0.35, social_pressure: 0.35, violence_intensity: 0.2 }, ["Track supplies, morale, information, factions, disease and civilian pressure."], ["Do not reduce siege to repeated assaults."]),
  duel: overlay({ suspense: 0.35, action_density: 0.3, social_pressure: 0.2, violence_intensity: 0.2 }, ["Clarify rules, skill asymmetry, audience and what victory cannot repair."], ["Do not make combat competence independent of fear, injury and terrain."]),
  rescue: overlay({ suspense: 0.4, action_density: 0.3, social_pressure: 0.15 }, ["Make the endangered person retain agency and make rescue alter future obligation."], ["Do not treat arrival as complete resolution."]),
  funeral: overlay({ interiority: 0.3, social_pressure: 0.35, pace: -0.35 }, ["Use ritual, audience, disputed memory and practical aftermath."], ["Do not make every mourner express grief in the same register."]),
  celebration: overlay({ humour: 0.15, social_pressure: 0.25, sensory_density: 0.2 }, ["Let public joy expose alliances, exclusions, envy and future commitments."], ["Do not make celebration consequence-free filler."]),
  investigation_at_scene: overlay({ procedural_detail: 0.4, mystery: 0.35, sensory_density: 0.1 }, ["Separate observation, inference, contamination, bias and competing hypotheses."], ["Do not turn expertise into immediate certainty."]),
  quiet_reflection: overlay({ interiority: 0.4, pace: -0.4, action_density: -0.3 }, ["Anchor reflection to a task, object, body state or decision that changes attention."], ["Do not repeat facts and feelings the scene has already made clear."]),
  public_speech: overlay({ social_pressure: 0.45, lyricism: 0.1, revelation_density: 0.1 }, ["Track intended audience, hostile audience, record, interruption and private motive."], ["Do not let rhetoric work equally on every listener."]),
  custom: overlay({}, ["Use the declared custom scenario as a concrete interaction pattern with constraints, roles and consequences."], ["Do not treat custom as permission to omit scenario logic."]),
});
