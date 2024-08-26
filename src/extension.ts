// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { text } from 'stream/consumers';
import * as vscode from 'vscode';

const AI_MODEL_SELECTOR: vscode.LanguageModelChatSelector = {
	vendor: 'copilot',
	family: 'gpt-4o',
};

const PROMPT = 'You are a helpful tutor. Your job is to teach the user with fun, simple exercises that they can complete right in the chat. Your exercises should start simple and get more complex as the user progresses. Move one concept at a time, and do not move on to the next concept until the user provides the correct answer. Give hints in your exercises to help the student learn. If the user is stuck, you can provide the answer and explain why it is the answer.';

const ANNOTATION_PROMPT = `You are a code tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you. The user is writing You will then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readibility and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;

let decorationTypes: Array<vscode.TextEditorDecorationType> = [];

export function activate(context: vscode.ExtensionContext) {

	// #region Chat Participant
	const handler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	) => {

		if (request.command === 'teach') {
			console.log("Teaching!");
		}

		// initialize the model
		let [model] = await vscode.lm.selectChatModels(AI_MODEL_SELECTOR);

		// initialize the messages array
		let messages = [
			vscode.LanguageModelChatMessage.User(PROMPT)
		];

		// get all the previous participant messages
		const previousMessages = context.history.filter(
			(h) => h instanceof vscode.ChatResponseTurn
		);

		// add the previous messages to the messages
		previousMessages.forEach((m) => {
			let fullMessage = '';
			m.response.forEach((r) => {
				const mdPart = r as vscode.ChatResponseMarkdownPart;
				fullMessage += mdPart.value.value;
			});
			messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
		});

		// add the user prompt to the messages
		messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

		if (model) {
			const chatResponse = await model.sendRequest(messages, {}, token);

			for await (const fragment of chatResponse.text) {
				stream.markdown(fragment);
			}
		}
	};

	const tutor = vscode.chat.createChatParticipant("code-tutor.tutor", handler);
	// #endregion

	// #region Editor Decorations
	const disposable = vscode.commands.registerTextEditorCommand('code-tutor.teach', async (textEditor: vscode.TextEditor) => {

		// clear all the decorations
		decorationTypes.forEach((decorationType) => {
			textEditor.setDecorations(decorationType, []);
		});

		let [model] = await vscode.lm.selectChatModels(AI_MODEL_SELECTOR);

		const codeWithLineNumbers = getCodeWithLineNumbers(textEditor);

		// init the chat message
		const messages = [
			vscode.LanguageModelChatMessage.User(ANNOTATION_PROMPT),
			vscode.LanguageModelChatMessage.User(`The user is working in ${textEditor.document.languageId}. The next message contains the code.`),
			vscode.LanguageModelChatMessage.User(codeWithLineNumbers),
		];

		if (model) {
			let chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

			let accumulatedResponse = "";

			for await (const fragment of chatResponse.text) {
				accumulatedResponse += fragment;

				// if the fragment is a }, we can try to parse the whole line
				if (fragment.includes("}")) {
					try {
						const annotation = JSON.parse(accumulatedResponse);
						applyDecoration(textEditor, annotation.line, annotation.suggestion);
						// reset the accumulator for the next line
						accumulatedResponse = "";
					}
					catch (e) {
						// do nothing
					}
				}

				console.log(accumulatedResponse);
			}
		}
	});

	context.subscriptions.push(disposable);

	// #endregion
}

function getCodeWithLineNumbers(textEditor: vscode.TextEditor) {
	let currentLine = textEditor.visibleRanges[0].start.line;
	const endLine = textEditor.visibleRanges[0].end.line;
	let code = '';
	while (currentLine < endLine) {
		code += `${currentLine + 1}: ${textEditor.document.lineAt(currentLine).text} \n`;
		currentLine++;
	}
	return code;
}

function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string) {

	const decorationType = vscode.window.createTextEditorDecorationType({
		after: {
			contentText: ` ${suggestion.substring(0, 25) + "..."}`,
			color: "grey",
		},
	});

	// get the end of the line with the specified line number
	const lineLength = editor.document.lineAt(line - 1).text.length;
	const range = new vscode.Range(
		new vscode.Position(line - 1, lineLength),
		new vscode.Position(line - 1, lineLength),
	);

	const decoration = { range: range, hoverMessage: suggestion };

	vscode.window.activeTextEditor?.setDecorations(decorationType, [
		decoration,
	]);

	decorationTypes.push(decorationType);
}

// This method is called when your extension is deactivated
export function deactivate() { }
