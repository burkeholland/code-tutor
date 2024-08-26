// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// Use gpt-4o since it is fast and high quality. gpt-3.5-turbo and gpt-4 are also available.
const MODEL_SELECTOR: vscode.LanguageModelChatSelector = {
  vendor: "copilot",
  family: "gpt-4o",
};

const PROMPT =
  "You are a helpful tutor. Your job is to teach the user with fun, simple exercises that they can complete right in the chat. Your exercises should start simple and get more complex as the user progresses. Move one concept at a time, and do not move on to the next concept until the user provides the correct answer. Give hints in your exercises to help the student learn. If the user is stuck, you can provide the answer and explain why it is the answer.";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) => {
    // init the model
    const [model] = await vscode.lm.selectChatModels(MODEL_SELECTOR);

    // init the messages array
    let messages = [vscode.LanguageModelChatMessage.User(PROMPT)];

    // add the previous messages to the messages array
    const previousMessages = context.history.filter(
      (h) => h instanceof vscode.ChatResponseTurn
    );

    previousMessages.forEach((m) => {
      let fullMessage = "";
      m.response.forEach((r) => {
        const mdPart = r as vscode.ChatResponseMarkdownPart;
        fullMessage += mdPart.value.value;
      });
      messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
    });

    // add the user prompt to the messages array
    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

    // send the messages to the model
    if (model) {
      const chatResponse = await model.sendRequest(messages, {}, token);

      // handle the chat response
      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }
    }
  };

  const tutor = vscode.chat.createChatParticipant("code-tutor.tutor", handler);

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "code-tutor.annotate",
    () => {
      const decorationType = vscode.window.createTextEditorDecorationType({
        after: {
          contentText: " Hello World",
          color: "grey",
        },
      });

      // apply the decoration to the 1st line
      const line = new vscode.Range(
        0,
        0,
        0,
        vscode.window.activeTextEditor?.document.lineAt(0).range.end
          .character || 0
      );
      const decoration = { range: line, hoverMessage: "Worldly hello!" };
      vscode.window.activeTextEditor?.setDecorations(decorationType, [
        decoration,
      ]);
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
