import { HsDevCodeAction } from "./hsdevCodeAction";
import { TopLevelTypeSignatureCA } from "./topLevelTypeSignatureCA";

export class CodeActionService {
    public static readonly CodeActions: HsDevCodeAction[] = [
        new TopLevelTypeSignatureCA()
    ];
}