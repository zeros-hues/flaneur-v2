let stage = "setup";
export function markValidationStage(value: string) { stage = value; }
export function validationStage() { return stage; }
