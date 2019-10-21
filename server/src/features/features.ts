import * as vsrv from 'vscode-languageserver';
import * as uuid from 'node-uuid';
import { CommandsService } from "../commands/commandsService";
import { Log } from '../debug/debugUtils';

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
            method: "textDocument/documentSymbol"
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
        },
        {
            id: uuid.v4(),
            method: "workspace/symbol"
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
            Log.debug(`features already registered`);
            return;
        }
        let registrationParams: vsrv.RegistrationParams = {
            registrations: Features.features
        };

        this.connection.sendRequest(vsrv.RegistrationRequest.type, registrationParams)
            .then(() => {
                Log.debug(`features registered`);
                this.areFeaturesRegistered = true;
            }, error => {
                Log.error(`error registering features: ${error}`);
                this.areFeaturesRegistered = false;
            });
        }
        
    /**
     * Disable all features on the client
     */
    public unregisterAllFeatures() {
        if (!this.areFeaturesRegistered) {
            Log.debug(`features already unregistered`);
            return;
        }
        let unregistrationParams: vsrv.UnregistrationParams = {
            unregisterations: Features.features
        };
        this.connection.sendRequest(vsrv.UnregistrationRequest.type, unregistrationParams)
        .then(() => {
            Log.debug(`features registered`);
            this.areFeaturesRegistered = false;
        }, error => {
            Log.error(`error unregistering features: ${error}`);
            this.areFeaturesRegistered = true;
        });
    }
}