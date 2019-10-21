import * as vsrv from 'vscode-languageserver';
import * as uuid from 'node-uuid';
import { CommandsService } from "../commands/commandsService";

/**
 * Manage features activation with the language client
 */
export class Features {

    private static readonly features: vsrv.Registration[] = [
        {
            /**
             * The id used to register the request. The id can be used to deregister
             * the request again.
             */
            id: uuid.v4(),
            method: "textDocument/hover"
        },
        {
            id: uuid.v4(),
            method: "textDocument/definition"
        },
        {
            id: uuid.v4(),
            method: "textDocument/references"
        },
        {
            id: uuid.v4(),
            method: "textDocument/completion",
            registerOptions: {
                resolveProvider: true
            }
        },
        {
            id: uuid.v4(),
            method: "textDocument/codeAction"
        },
        {
            id: uuid.v4(),
            method: "textDocument/rename"
        },
        {
            id: uuid.v4(),
            method: "workspace/executeCommand",
            registerOptions: {
                commands: CommandsService.toFeaturesCommands()
            }
        }
    ];

    private areFeaturesRegistered: boolean = false;

    constructor(private readonly connection: vsrv.IConnection) {

    }

    /**
     * Enable all features on the client
     */
    public registerAllFeatures() {
        if (this.areFeaturesRegistered) {
            return;
        }
        let registrationParams: vsrv.RegistrationParams = {
            registrations: Features.features
        };

        this.connection.sendRequest(vsrv.RegistrationRequest.type, registrationParams)
            .then(() => {
                this.areFeaturesRegistered = true;
            }, error => {
                this.areFeaturesRegistered = false;
                console.log("error for registration request: " + error);
            });
    }

    /**
     * Disable all features on the client
     */
    public unregisterAllFeatures() {
        if (!this.areFeaturesRegistered) {
            return;
        }
        let unregistrationParams: vsrv.UnregistrationParams = {
            unregisterations: Features.features
        };
        this.connection.sendRequest(vsrv.UnregistrationRequest.type, unregistrationParams)
            .then(() => {
                this.areFeaturesRegistered = false;
            }, error => {
                this.areFeaturesRegistered = true;
                console.log("error for unregistration request: " + error);
            });
    }
}