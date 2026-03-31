import type {
  RuleBinding,
  CellSpec,
  EntitySpec,
  AttributeId,
  ComponentBinding,
  ConfigId,
  StructuredCell,
} from './types';
import type { SeededRandom } from '../domain/random';
import { ATTRIBUTE_DOMAINS } from './attributes';
import { CONFIGURATIONS } from './configurations';
import { RULES } from './rules';

/**
 * I-RAVEN Attribute Bisection Tree distractor generation.
 *
 * For each answer attribute controlled by a rule:
 * 1. Compute the set of valid values via enumerateValid()
 * 2. The correct answer is in the intersection of all valid sets
 * 3. Distractors are built by picking values that satisfy SOME rules but not ALL
 * 4. Guarantees: no distractor = answer, no duplicates, no single-row elimination
 */
export function generateDistractors(
  rng: SeededRandom,
  answer: CellSpec,
  ruleBindings: RuleBinding[],
  grid: CellSpec[][],
  count: number,
): CellSpec[] {
  if (answer.entities.length === 0) {
    return fallbackDistractors(rng, answer, count);
  }

  const row2col0 = grid[2]?.[0];
  const row2col1 = grid[2]?.[1];

  // Step 1: For each rule binding on an entity attribute, compute valid values
  // and identify which attributes the answer is constrained on.
  // For multi-entity answers, we identify constraints per entity index.
  const entityAttrs: (keyof EntitySpec)[] = ['shape', 'size', 'color', 'angle'];
  const constrainedAttrs: {
    attr: keyof EntitySpec;
    attrId: AttributeId;
    validValues: number[];
    correctValue: number;
    binding: RuleBinding;
    entityIdx: number;
  }[] = [];

  for (const binding of ruleBindings) {
    const attrKey = binding.attributeId as keyof EntitySpec;
    if (!entityAttrs.includes(attrKey)) continue;
    if (!row2col0 || !row2col1) continue;

    const domain = ATTRIBUTE_DOMAINS[binding.attributeId];
    const rule = RULES[binding.ruleId];

    // For multi-entity cells, try to match constraints per entity index
    const numEntities = answer.entities.length;
    for (let ei = 0; ei < numEntities; ei++) {
      const entityA = row2col0.entities[ei];
      const entityB = row2col1.entities[ei];
      const answerEntity = answer.entities[ei];
      if (!entityA || !entityB || !answerEntity) continue;

      const a = entityA[attrKey];
      const b = entityB[attrKey];
      const validValues = rule.enumerateValid(domain, a, b, binding.params);

      constrainedAttrs.push({
        attr: attrKey,
        attrId: binding.attributeId,
        validValues,
        correctValue: answerEntity[attrKey],
        binding,
        entityIdx: ei,
      });
    }
  }

  const distractors: CellSpec[] = [];
  const usedKeys = new Set<string>();
  usedKeys.add(cellKey(answer));

  // Step 2: ABT — generate distractors by violating subsets of constraints
  // Strategy pipeline: ABT single/double violation + S6 enhancements
  if (constrainedAttrs.length > 0) {
    // Strategy 1+2: ABT single + double rule violations (existing)
    const abtCandidates = generateABTCandidates(
      rng,
      answer.entities,
      constrainedAttrs,
      answer,
      count * 3,
    );

    // S6 Strategy 3: row-confusion (correct for another row but wrong for row 2)
    const rowConfusion = generateRowConfusionCandidates(
      rng,
      answer.entities,
      ruleBindings,
      grid,
      answer,
    );

    // S6 Strategy 4: closest-invalid-value (hardest to distinguish visually)
    const closestInvalid = generateClosestInvalidCandidates(
      answer.entities,
      constrainedAttrs,
      answer,
    );

    // Merge all candidates, prioritizing closest-invalid and row-confusion (harder)
    const allCandidates = rng.shuffle([...closestInvalid, ...rowConfusion, ...abtCandidates]);

    // Filter: must violate at least one rule, no answer duplicates
    for (const candidate of allCandidates) {
      if (distractors.length >= count) break;
      const key = cellKey(candidate);
      if (usedKeys.has(key)) continue;

      // Verify it actually violates at least one constraint
      if (!violatesAtLeastOne(candidate, constrainedAttrs)) continue;

      // Anti-shortcut: check it's not trivially eliminable by single-row analysis
      if (isEliminableBySingleRow(candidate, grid, ruleBindings)) continue;

      usedKeys.add(key);
      distractors.push(candidate);
    }
  }

  // Step 3: Fallback — fill remaining slots with perturbation
  let fallbackAttempts = 0;
  while (distractors.length < count && fallbackAttempts < 200) {
    fallbackAttempts++;
    const distractor = perturbAnswer(rng, answer, constrainedAttrs);
    const key = cellKey(distractor);
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      distractors.push(distractor);
    }
  }

  return distractors.slice(0, count);
}

interface ConstrainedAttr {
  attr: keyof EntitySpec;
  attrId: AttributeId;
  validValues: number[];
  correctValue: number;
  binding: RuleBinding;
  entityIdx: number;
}

/**
 * Generate ABT candidate distractors.
 * For each candidate: satisfy some rules, violate others.
 * Supports multi-entity answers (one entity per component).
 */
function generateABTCandidates(
  rng: SeededRandom,
  answerEntities: EntitySpec[],
  constrained: ConstrainedAttr[],
  answer: CellSpec,
  maxCandidates: number,
): CellSpec[] {
  const candidates: CellSpec[] = [];

  // Strategy 1: Violate exactly one constraint at a time
  for (const toViolate of constrained) {
    const domain = ATTRIBUTE_DOMAINS[toViolate.attrId];

    // Pick values that are NOT in the valid set for this constraint
    const invalidValues: number[] = [];
    for (let v = domain.min; v <= domain.max; v++) {
      if (!toViolate.validValues.includes(v)) {
        invalidValues.push(v);
      }
    }

    if (invalidValues.length === 0) continue;

    // For each invalid value, keep all other attributes correct
    const shuffledInvalid = rng.shuffle([...invalidValues]);
    for (const iv of shuffledInvalid.slice(0, 4)) {
      // Clone all entities, modify only the target entity index
      const newEntities = answerEntities.map((e, idx) => {
        if (idx === toViolate.entityIdx) {
          return { ...e, [toViolate.attr]: iv };
        }
        return { ...e };
      });

      // Satisfy all OTHER constraints on the same entity
      let satisfiesOthers = true;
      for (const other of constrained) {
        if (other === toViolate) continue;
        const entity = newEntities[other.entityIdx];
        if (entity && !other.validValues.includes(entity[other.attr])) {
          satisfiesOthers = false;
          break;
        }
      }

      if (satisfiesOthers) {
        candidates.push({
          entities: newEntities,
          positions: [...answer.positions],
        });
      }
    }

    if (candidates.length >= maxCandidates) break;
  }

  // Strategy 2: Violate two constraints simultaneously (harder distractors)
  if (constrained.length >= 2 && candidates.length < maxCandidates) {
    for (let i = 0; i < constrained.length && candidates.length < maxCandidates; i++) {
      for (let j = i + 1; j < constrained.length && candidates.length < maxCandidates; j++) {
        const c1 = constrained[i]!;
        const c2 = constrained[j]!;

        const domain1 = ATTRIBUTE_DOMAINS[c1.attrId];
        const domain2 = ATTRIBUTE_DOMAINS[c2.attrId];

        const invalid1: number[] = [];
        for (let v = domain1.min; v <= domain1.max; v++) {
          if (!c1.validValues.includes(v)) invalid1.push(v);
        }
        const invalid2: number[] = [];
        for (let v = domain2.min; v <= domain2.max; v++) {
          if (!c2.validValues.includes(v)) invalid2.push(v);
        }

        if (invalid1.length > 0 && invalid2.length > 0) {
          const v1 = rng.choice(invalid1);
          const v2 = rng.choice(invalid2);
          const newEntities = answerEntities.map((e, idx) => {
            const clone = { ...e };
            if (idx === c1.entityIdx) clone[c1.attr] = v1;
            if (idx === c2.entityIdx) clone[c2.attr] = v2;
            return clone;
          });
          candidates.push({
            entities: newEntities,
            positions: [...answer.positions],
          });
        }
      }
    }
  }

  // Shuffle candidates for variety
  return rng.shuffle(candidates);
}

// =============================================================================
// S6: Enhanced distractor strategies
// =============================================================================

/**
 * Row-confusion distractors: correct answer for row 0 or row 1 but NOT row 2.
 * The player must verify the right row.
 */
function generateRowConfusionCandidates(
  _rng: SeededRandom,
  answerEntities: EntitySpec[],
  ruleBindings: RuleBinding[],
  grid: CellSpec[][],
  answer: CellSpec,
): CellSpec[] {
  const candidates: CellSpec[] = [];
  const entityAttrs: (keyof EntitySpec)[] = ['shape', 'size', 'color', 'angle'];

  // For each alternate row (0 and 1), compute what the answer WOULD be
  for (let altRow = 0; altRow < 2; altRow++) {
    const rowData = grid[altRow];
    if (!rowData || rowData.length < 3) continue;

    const newEntities = answerEntities.map((e) => ({ ...e }));

    for (const binding of ruleBindings) {
      const attrKey = binding.attributeId as keyof EntitySpec;
      if (!entityAttrs.includes(attrKey)) continue;

      const rule = RULES[binding.ruleId];
      const a = rowData[0]?.entities[0]?.[attrKey] ?? 0;
      const b = rowData[1]?.entities[0]?.[attrKey] ?? 0;
      const altAnswer = rule.deriveThird(a, b, binding.params);

      // Apply to entity 0 (primary entity)
      if (newEntities[0]) {
        newEntities[0][attrKey] = altAnswer;
      }
    }

    candidates.push({ entities: newEntities, positions: [...answer.positions] });
  }

  return candidates;
}

/**
 * Closest-invalid-value distractors: pick the invalid value closest to the correct one.
 * Much harder to distinguish visually.
 */
function generateClosestInvalidCandidates(
  answerEntities: EntitySpec[],
  constrained: ConstrainedAttr[],
  answer: CellSpec,
): CellSpec[] {
  const candidates: CellSpec[] = [];

  for (const c of constrained) {
    const domain = ATTRIBUTE_DOMAINS[c.attrId];
    const invalidValues: number[] = [];
    for (let v = domain.min; v <= domain.max; v++) {
      if (!c.validValues.includes(v)) invalidValues.push(v);
    }
    if (invalidValues.length === 0) continue;

    // Sort by distance to correct value, take closest
    invalidValues.sort((a, b) => Math.abs(a - c.correctValue) - Math.abs(b - c.correctValue));
    const closest = invalidValues[0]!;

    const newEntities = answerEntities.map((e, idx) => {
      if (idx === c.entityIdx) return { ...e, [c.attr]: closest };
      return { ...e };
    });

    candidates.push({ entities: newEntities, positions: [...answer.positions] });
  }

  return candidates;
}

/**
 * Check if a candidate violates at least one constraint.
 */
function violatesAtLeastOne(candidate: CellSpec, constrained: ConstrainedAttr[]): boolean {
  if (candidate.entities.length === 0) return true;

  for (const c of constrained) {
    const entity = candidate.entities[c.entityIdx];
    if (entity && !c.validValues.includes(entity[c.attr])) {
      return true;
    }
  }
  return false;
}

/**
 * Anti-shortcut check: a distractor is "eliminable by single row" if
 * looking at only one row (row 0 or row 1) is enough to rule it out.
 * This catches distractors that are too obviously wrong.
 */
function isEliminableBySingleRow(
  candidate: CellSpec,
  grid: CellSpec[][],
  ruleBindings: RuleBinding[],
): boolean {
  if (candidate.entities.length === 0) return false;
  const entityAttrs: (keyof EntitySpec)[] = ['shape', 'size', 'color', 'angle'];

  // Check each row independently
  for (let row = 0; row < 2; row++) {
    const rowData = grid[row];
    if (!rowData || rowData.length < 3) continue;

    let violatesAllBindingsInRow = true;

    for (const binding of ruleBindings) {
      const attrKey = binding.attributeId as keyof EntitySpec;
      if (!entityAttrs.includes(attrKey)) continue;

      const rule = RULES[binding.ruleId];
      // Build a hypothetical row with the candidate's value in position [2]
      const rowVals: [number, number, number] = [
        rowData[0]!.entities[0]?.[attrKey] ?? 0,
        rowData[1]!.entities[0]?.[attrKey] ?? 0,
        candidate.entities[0]?.[attrKey] ?? 0,
      ];

      // If the candidate's value for this attr would make a valid row
      // when placed in position [2], it's not eliminable by this row alone
      if (rule.validate(rowVals, binding.params)) {
        violatesAllBindingsInRow = false;
        break;
      }
    }

    // If checking only this row eliminates the candidate, it's too easy
    if (violatesAllBindingsInRow) return true;
  }

  return false;
}

function perturbAnswer(
  rng: SeededRandom,
  answer: CellSpec,
  constrained: ConstrainedAttr[],
): CellSpec {
  if (answer.entities.length === 0) {
    return { entities: [{ shape: 0, size: 0, color: 0, angle: 0 }], positions: [0] };
  }

  // Clone all entities
  const entities = answer.entities.map((e) => ({ ...e }));

  // Pick which entity to perturb (random across all entities)
  const entityIdx = rng.int(0, entities.length);
  const entity = entities[entityIdx]!;

  // Prefer perturbing constrained attributes (more meaningful distractors)
  if (constrained.length > 0 && rng.next() < 0.7) {
    const c = rng.choice(constrained);
    const targetEntity = entities[c.entityIdx] ?? entity;
    const domain = ATTRIBUTE_DOMAINS[c.attrId];
    let newVal = rng.int(domain.min, domain.max + 1);
    let attempts = 0;
    while (newVal === targetEntity[c.attr] && attempts < 20) {
      newVal = rng.int(domain.min, domain.max + 1);
      attempts++;
    }
    targetEntity[c.attr] = newVal;
  } else {
    const attrs: (keyof EntitySpec)[] = ['shape', 'size', 'color', 'angle'];
    const attr = rng.choice(attrs);
    const domain = ATTRIBUTE_DOMAINS[attr];
    let newVal = rng.int(domain.min, domain.max + 1);
    let attempts = 0;
    while (newVal === entity[attr] && attempts < 20) {
      newVal = rng.int(domain.min, domain.max + 1);
      attempts++;
    }
    entity[attr] = newVal;
  }

  return { entities, positions: [...answer.positions] };
}

function fallbackDistractors(rng: SeededRandom, answer: CellSpec, count: number): CellSpec[] {
  const distractors: CellSpec[] = [];
  const usedKeys = new Set<string>();
  usedKeys.add(cellKey(answer));

  for (let i = 0; i < count * 10 && distractors.length < count; i++) {
    const d = perturbAnswer(rng, answer, []);
    const key = cellKey(d);
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      distractors.push(d);
    }
  }
  return distractors;
}

function cellKey(cell: CellSpec): string {
  return cell.entities.map((e) => `${e.shape}:${e.size}:${e.color}:${e.angle}`).join('|');
}

// =============================================================================
// Reference-compatible distractor generation (Slice 5)
// =============================================================================

/** Key a structured cell for deduplication */
function structuredCellKey(cell: StructuredCell): string {
  return cell.components
    .map((c) => {
      const ePart = c.entities.map((e) => `${e.shape}:${e.size}:${e.color}:${e.angle}`).join('|');
      const pPart = [...c.positions].sort((a, b) => a - b).join(',');
      return `n${c.numEntities}[${ePart}]@${pPart}`;
    })
    .join('//');
}

/** Deep clone a structured cell */
function cloneStructuredCell(cell: StructuredCell): StructuredCell {
  return {
    components: cell.components.map((c) => ({
      numEntities: c.numEntities,
      positions: [...c.positions],
      entities: c.entities.map((e) => ({ ...e })),
      uniform: c.uniform,
    })),
  };
}

/**
 * I-RAVEN sample_available_attributes equivalent.
 *
 * Determines which attributes on which components can be modified
 * for distractor generation, based on the rule bindings.
 *
 * Returns: [componentIdx, attrName, minLevel, maxLevel, uniform]
 */
interface ModifiableAttr {
  componentIdx: number;
  attrName: 'shape' | 'size' | 'color' | 'number' | 'position';
  minLevel: number;
  maxLevel: number;
  uniform: boolean;
  positionChoices?: number[][];
}

function combinationsOfK(values: number[], k: number): number[][] {
  if (k <= 0 || k > values.length) return [];
  if (k === 1) return values.map((value) => [value]);

  const result: number[][] = [];
  for (let i = 0; i <= values.length - k; i++) {
    const head = values[i]!;
    const tails = combinationsOfK(values.slice(i + 1), k - 1);
    for (const tail of tails) {
      result.push([head, ...tail]);
    }
  }
  return result;
}

function positionsKey(positions: number[]): string {
  return [...positions].sort((a, b) => a - b).join(',');
}

function sampleAvailableAttributes(
  componentBindings: ComponentBinding[],
  numberBindings: (RuleBinding | null)[],
  answer: StructuredCell,
  configId: ConfigId,
): ModifiableAttr[] {
  const result: ModifiableAttr[] = [];
  const entityAttrs: ('shape' | 'size' | 'color')[] = ['shape', 'size', 'color'];
  const config = CONFIGURATIONS[configId];

  for (let compIdx = 0; compIdx < componentBindings.length; compIdx++) {
    const comp = answer.components[compIdx];
    if (!comp) continue;
    const componentBinding = componentBindings[compIdx];
    if (!componentBinding) continue;
    const bindings = componentBinding.ruleBindings;
    const numberBinding = numberBindings[compIdx];
    const maxSlots =
      config?.slotsPerComponent[compIdx] ?? Math.max(comp.numEntities, comp.positions.length);

    // I-RAVEN exposes Number and Position as separate distractor dimensions.
    // Our structured generator collapses them into a single layout rule group,
    // so we surface both dimensions whenever the component has positional slots.
    if (numberBinding) {
      const currentNum = comp.numEntities;
      if (maxSlots > 1 && currentNum >= 1 && currentNum <= maxSlots) {
        result.push({
          componentIdx: compIdx,
          attrName: 'number',
          minLevel: 1,
          maxLevel: maxSlots,
          uniform: true,
        });

        const allSlots = Array.from({ length: maxSlots }, (_, i) => i);
        const positionChoices = combinationsOfK(allSlots, currentNum).filter(
          (positions) => positionsKey(positions) !== positionsKey(comp.positions),
        );

        if (positionChoices.length > 0) {
          result.push({
            componentIdx: compIdx,
            attrName: 'position',
            minLevel: 0,
            maxLevel: maxSlots - 1,
            uniform: true,
            positionChoices,
          });
        }
      }
    }

    // Entity attributes: modifiable if rule is Constant + entities are uniform
    for (const attr of entityAttrs) {
      const binding = bindings.find((b) => b.attributeId === attr);
      if (!binding) continue;

      // Per I-RAVEN: attribute is modifiable if rule is Constant
      // (non-constant rules constrain the value, so we can't freely modify it)
      if (binding.ruleId === 'constant') {
        const domain = ATTRIBUTE_DOMAINS[attr];
        const dMin = attr === 'shape' ? 1 : domain.min;
        result.push({
          componentIdx: compIdx,
          attrName: attr,
          minLevel: dMin,
          maxLevel: domain.max,
          uniform: comp.uniform,
        });
      }
    }
  }

  return result;
}

/**
 * Sample a new value for an attribute, different from the current value.
 */
function sampleNewValue(rng: SeededRandom, current: number, min: number, max: number): number {
  const range = max - min + 1;
  if (range <= 1) return current;
  let v: number;
  let attempts = 0;
  do {
    v = rng.int(min, max + 1);
    attempts++;
  } while (v === current && attempts < 20);
  return v;
}

/**
 * Apply a new value to a structured cell on a given component + attribute.
 */
function applyNewValue(
  cell: StructuredCell,
  compIdx: number,
  attrName: 'shape' | 'size' | 'color' | 'number' | 'position',
  value: number | number[],
): void {
  const comp = cell.components[compIdx];
  if (!comp) return;

  if (attrName === 'number') {
    const targetCount = typeof value === 'number' ? value : value.length;
    // Modify entity count (add/remove entities)
    if (targetCount > comp.numEntities) {
      // Add entities by cloning the first
      while (comp.entities.length < targetCount) {
        const template = comp.entities[0]!;
        comp.entities.push({ ...template });
      }
    } else if (targetCount < comp.numEntities) {
      comp.entities.length = targetCount;
    }
    comp.numEntities = targetCount;
    // Adjust positions
    comp.positions = Array.from({ length: targetCount }, (_, i) => i);
  } else if (attrName === 'position') {
    const nextPositions = Array.isArray(value) ? value : comp.positions;
    comp.positions = [...nextPositions].sort((a, b) => a - b);
    comp.numEntities = comp.positions.length;
    if (comp.entities.length > comp.numEntities) {
      comp.entities.length = comp.numEntities;
    }
  } else {
    const scalarValue = Array.isArray(value) ? (value[0] ?? 0) : value;
    // Entity attribute: apply to all entities if uniform, else first only
    if (comp.uniform) {
      for (const e of comp.entities) {
        e[attrName] = scalarValue;
      }
    } else {
      if (comp.entities[0]) {
        comp.entities[0][attrName] = scalarValue;
      }
    }
  }
}

function sampleAlternativeValue(
  rng: SeededRandom,
  cell: StructuredCell,
  attr: ModifiableAttr,
): number | number[] {
  if (attr.attrName === 'position') {
    const choices = attr.positionChoices ?? [];
    if (choices.length === 0) {
      return [...(cell.components[attr.componentIdx]?.positions ?? [])];
    }
    const sampled = rng.choice(choices);
    return sampled ? [...sampled] : [...(cell.components[attr.componentIdx]?.positions ?? [])];
  }

  const currentVal = getAttrValue(cell, attr);
  return sampleNewValue(rng, currentVal, attr.minLevel, attr.maxLevel);
}

/**
 * Generate distractors following the I-RAVEN combinatorial strategy.
 *
 * Matches the upstream pipeline:
 * 1. Determine modifiable attributes via sampleAvailableAttributes
 * 2. Select up to 3 attributes to modify
 * 3. Generate 7 distractors via combinatorial modification
 */
export function generateReferenceDistractors(
  rng: SeededRandom,
  answer: StructuredCell,
  componentBindings: ComponentBinding[],
  numberBindings: (RuleBinding | null)[],
  _grid: StructuredCell[][],
  count: number,
  configId: ConfigId,
): StructuredCell[] {
  const modifiable = sampleAvailableAttributes(componentBindings, numberBindings, answer, configId);

  if (modifiable.length === 0) {
    // Fallback: perturb entity attributes randomly
    return fallbackStructuredDistractors(rng, answer, count);
  }

  // Select up to 3 attributes to modify (matching I-RAVEN)
  const numToModify = Math.min(3, modifiable.length);
  let selected: ModifiableAttr[];
  if (numToModify < modifiable.length) {
    const indices = rng.shuffle(Array.from({ length: modifiable.length }, (_, i) => i));
    selected = indices.slice(0, numToModify).flatMap((i) => (modifiable[i] ? [modifiable[i]] : []));
  } else {
    selected = [...modifiable];
  }
  selected = rng.shuffle(selected);

  // Move Number to last position (matches I-RAVEN convention)
  const numIdx = selected.findIndex((s) => s.attrName === 'number');
  if (numIdx >= 0 && numIdx < selected.length - 1) {
    const [num] = selected.splice(numIdx, 1);
    if (num) selected.push(num);
  }

  // Combinatorial distractor generation
  const answerCopy = cloneStructuredCell(answer);
  let candidates: StructuredCell[] = [answerCopy];

  if (selected.length >= 3) {
    // 2^3 - 1 = 7 distractors
    for (const attr of selected) {
      const newVal = sampleAlternativeValue(rng, answerCopy, attr);
      const tmp: StructuredCell[] = [];
      for (const c of candidates) {
        const clone = cloneStructuredCell(c);
        applyNewValue(clone, attr.componentIdx, attr.attrName, newVal);
        tmp.push(clone);
      }
      candidates = [...candidates, ...tmp];
    }
  } else if (selected.length === 2) {
    // 1 + 1 + 3×2 = 8 candidates total
    const attr0 = selected[0]!;
    const attr1 = selected[1]!;

    const newVal0 = sampleAlternativeValue(rng, answerCopy, attr0);
    const modified0 = cloneStructuredCell(answerCopy);
    applyNewValue(modified0, attr0.componentIdx, attr0.attrName, newVal0);
    candidates.push(modified0);

    for (let i = 0; i < 3; i++) {
      const newVal1 = sampleAlternativeValue(rng, answerCopy, attr1);
      for (let j = 0; j < 2; j++) {
        const base = cloneStructuredCell(candidates[j]!);
        applyNewValue(base, attr1.componentIdx, attr1.attrName, newVal1);
        candidates.push(base);
      }
    }
  } else if (selected.length === 1) {
    // 7 distractors by varying one attribute
    const attr = selected[0]!;
    for (let i = 0; i < 7; i++) {
      const newVal = sampleAlternativeValue(rng, answerCopy, attr);
      const clone = cloneStructuredCell(answerCopy);
      applyNewValue(clone, attr.componentIdx, attr.attrName, newVal);
      candidates.push(clone);
    }
  }

  // Shuffle and deduplicate
  candidates = rng.shuffle(candidates);

  const answerKey = structuredCellKey(answer);
  const usedKeys = new Set<string>();
  usedKeys.add(answerKey);

  const distractors: StructuredCell[] = [];
  for (const c of candidates) {
    const key = structuredCellKey(c);
    if (key === answerKey) continue;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    distractors.push(c);
    if (distractors.length >= count) break;
  }

  // Fill remaining with fallback if needed
  if (distractors.length < count) {
    const extra = fallbackStructuredDistractors(rng, answer, count - distractors.length);
    for (const d of extra) {
      const key = structuredCellKey(d);
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        distractors.push(d);
        if (distractors.length >= count) break;
      }
    }
  }

  return distractors.slice(0, count);
}

function getAttrValue(cell: StructuredCell, attr: ModifiableAttr): number {
  const comp = cell.components[attr.componentIdx];
  if (!comp) return 0;
  if (attr.attrName === 'number') return comp.numEntities;
  if (attr.attrName === 'position') return comp.positions[0] ?? 0;
  return comp.entities[0]?.[attr.attrName] ?? 0;
}

function fallbackStructuredDistractors(
  rng: SeededRandom,
  answer: StructuredCell,
  count: number,
): StructuredCell[] {
  const distractors: StructuredCell[] = [];
  const usedKeys = new Set<string>();
  usedKeys.add(structuredCellKey(answer));

  const attrs: ('shape' | 'size' | 'color')[] = ['shape', 'size', 'color'];

  for (let i = 0; i < count * 10 && distractors.length < count; i++) {
    const clone = cloneStructuredCell(answer);
    const compIdx = rng.int(0, clone.components.length);
    const comp = clone.components[compIdx];
    if (!comp || comp.entities.length === 0) continue;

    const attr = rng.choice(attrs);
    const domain = ATTRIBUTE_DOMAINS[attr];
    const entity = comp.entities[0]!;
    let newVal = rng.int(attr === 'shape' ? 1 : domain.min, domain.max + 1);
    let attempts = 0;
    while (newVal === entity[attr] && attempts < 20) {
      newVal = rng.int(attr === 'shape' ? 1 : domain.min, domain.max + 1);
      attempts++;
    }

    if (comp.uniform) {
      for (const e of comp.entities) e[attr] = newVal;
    } else {
      entity[attr] = newVal;
    }

    const key = structuredCellKey(clone);
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      distractors.push(clone);
    }
  }

  return distractors;
}
